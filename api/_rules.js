// The free stamp, decided by rules, not AI. Every check is something a stranger feels in their first five
// seconds (can I tell what this is, who it's for, what to click) or something that slows those seconds down
// (speed, phone, https, share preview). Each check has a weight; the share of weight passed is the score.
//   ALIVE: 80+ and a clear headline.  COPE: 55+.  DEAD: below 55, or no headline at all.
// Input: the snapshot from _inspect.js, plus what the rendered page showed (from _shot.js capture), if anything.
// Output: { verdict, score, sentence, checks: [{ id, label, pass, detail, fix, weight }] }.

// Words that sound like a pitch deck and say nothing a stranger can picture.
const FOG = [
  "reimagine", "reimagined", "revolutionize", "revolutionise", "redefine", "unlock", "unleash", "empower", "elevate",
  "supercharge", "synergy", "seamless", "next-gen", "next generation", "cutting-edge", "game-changing", "game changer",
  "innovative", "world-class", "best-in-class", "all-in-one", "ai-native", "ai-powered", "future of", "transform",
  "the way you work", "what's next", "limitless", "frictionless", "holistic", "paradigm", "leverage", "disrupt",
];
const ACTION = /\b(try|start|get|sign ?up|join|book|buy|order|shop|download|install|request|subscribe|create|build|launch|claim|see pricing|pricing|demo|contact|talk to|apply|register)\b/i;
const AUDIENCE = /\bfor (?!free\b|you\b|good\b|example\b|more\b|less\b|all\b|everyone\b)[a-z]/i;

const words = (s) => String(s || "").split(/\s+/).filter(Boolean);
const fogIn = (s) => FOG.filter((w) => String(s || "").toLowerCase().includes(w));
const unique = (list) => [...new Set(list.map((t) => t.toLowerCase()))];

export function scorePage(snapshot, rendered = null) {
  const s = snapshot || {};
  const c = s.content || {};
  const h1 = (rendered?.h1 || c.h1 || "").trim();
  const ctas = unique([...(rendered?.ctas || []), ...(rendered ? [] : c.ctas || [])]);
  const actions = ctas.filter((t) => ACTION.test(t));
  const pitch = `${h1} ${c.description || ""} ${s.title || ""}`;
  const missing = new Set(s.missing || []);
  const fog = fogIn(h1);
  const h1Words = words(h1).length;

  const checks = [
    {
      id: "headline",
      label: "There's a headline",
      weight: 4,
      pass: !!h1,
      detail: h1 ? `“${h1.slice(0, 120)}”` : "No main headline (h1) on the first screen.",
      fix: "Put one big line at the top that says what this is.",
    },
    {
      id: "plain",
      label: "The headline is plain English",
      weight: 4,
      pass: !!h1 && fog.length === 0,
      detail: !h1 ? "Nothing to read." : fog.length ? `Pitch-deck words: ${fog.slice(0, 3).join(", ")}.` : "No buzzwords.",
      fix: "Name the thing and the result. “Meeting notes that write themselves” beats “Reimagine how you work”.",
    },
    {
      id: "short",
      label: "The headline reads in one glance",
      weight: 2,
      pass: h1Words > 0 && h1Words <= 10,
      detail: h1Words ? `${h1Words} word${h1Words === 1 ? "" : "s"}.` : "No headline.",
      fix: "Ten words or fewer. Move the rest to the line under it.",
    },
    {
      id: "who",
      label: "It says who it's for",
      weight: 3,
      pass: AUDIENCE.test(pitch),
      detail: AUDIENCE.test(pitch) ? "Names an audience." : "No “for …” anywhere in the headline, title, or description.",
      fix: "Say who it's for in the headline or the line under it: “for sales teams on Zoom”.",
    },
    {
      id: "next",
      label: "There's a clear next step",
      weight: 3,
      pass: actions.length > 0,
      detail: actions.length ? `“${actions[0]}”` : "No button that tells a visitor what to do.",
      fix: "One button with a verb and the payoff: “Try it free”, “Get the template”.",
    },
    {
      id: "focus",
      label: "Buttons don't fight each other",
      weight: 2,
      pass: actions.length <= 4,
      detail: `${actions.length} action button${actions.length === 1 ? "" : "s"}${actions.length > 4 ? `: ${actions.slice(0, 4).join(", ")}…` : "."}`,
      fix: "Keep one main button on the first screen and one quiet second choice at most.",
    },
    {
      id: "speed",
      label: "It loads fast",
      weight: 3,
      pass: s.loadMs > 0 && s.loadMs <= 2500,
      detail: s.loadMs ? `HTML arrived in ${(s.loadMs / 1000).toFixed(1)}s.` : "Couldn't time it.",
      fix: "Aim for under 2.5 seconds: cache the page, trim redirects, move heavy scripts below the fold.",
    },
    {
      id: "weight",
      label: "It isn't heavy",
      weight: 1,
      pass: s.htmlKB > 0 && s.htmlKB <= 500 && (s.scripts || 0) <= 40,
      detail: s.htmlKB ? `${s.htmlKB} KB of HTML, ${s.scripts || 0} scripts.` : "Couldn't weigh it.",
      fix: "Under 500 KB of HTML and fewer than 40 scripts.",
    },
    {
      id: "phone",
      label: "It's set up for phones",
      weight: 2,
      pass: !missing.has("viewport"),
      detail: missing.has("viewport") ? "No viewport tag, so phones show a shrunken desktop page." : "Has a viewport tag.",
      fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
    },
    {
      id: "https",
      label: "It's on https",
      weight: 2,
      pass: !!s.https,
      detail: s.https ? "Secure." : "Browsers mark it “Not secure”.",
      fix: "Turn on https at your host and redirect http to it.",
    },
    {
      id: "title",
      label: "The tab title says something",
      weight: 1,
      pass: !!s.title && s.title.length <= 65,
      detail: s.title ? `“${s.title.slice(0, 80)}”${s.title.length > 65 ? " (too long)" : ""}` : "No page title.",
      fix: "Under 65 characters: product name, then what it does.",
    },
    {
      id: "description",
      label: "Search results get a description",
      weight: 1,
      pass: !missing.has("description"),
      detail: missing.has("description") ? "No meta description." : "Has one.",
      fix: "One sentence on what it is and who it's for, under 155 characters.",
    },
    {
      id: "share",
      label: "Links show a preview when shared",
      weight: 1,
      pass: !missing.has("og:title") && !missing.has("og:image"),
      detail: ["og:title", "og:image"].filter((t) => missing.has(t)).length ? `Missing ${["og:title", "og:image"].filter((t) => missing.has(t)).join(" and ")}.` : "Title and image set.",
      fix: "Add og:title and a 1200 × 630 og:image.",
    },
  ];

  const total = checks.reduce((n, k) => n + k.weight, 0);
  const got = checks.reduce((n, k) => n + (k.pass ? k.weight : 0), 0);
  const score = Math.round((got / total) * 100);
  const passed = (id) => checks.find((k) => k.id === id).pass;

  let verdict = score >= 80 ? "ALIVE" : score >= 55 ? "COPE" : "DEAD";
  if (!h1) verdict = "DEAD";
  else if (verdict === "ALIVE" && !passed("plain")) verdict = "COPE";

  return { verdict, score, sentence: sentenceFor(verdict, checks), checks };
}

// One line in a stranger's voice, built from the most important thing that failed.
const SAY = {
  headline: "Five seconds in, I can't find a headline that tells me what this is.",
  plain: "The headline sounds impressive, but I still can't picture what this does.",
  who: "I get roughly what it does, but not whether it's for someone like me.",
  next: "I'm interested, but nothing tells me what to click.",
  focus: "Too many buttons. I don't know which one is for me.",
  short: "The headline is long enough that I stopped reading halfway.",
  speed: "I almost left before it finished loading.",
  phone: "On my phone this is a tiny desktop page. I'm pinching to read it.",
  https: "My browser says this site isn't secure, so I'm not typing anything in.",
};
const ALIVE_SAY = "In five seconds I know what it is, who it's for, and what to click.";
// ALIVE pages still get the one thing worth fixing next.
const TIP = {
  who: "I get it fast. Say who it's for and I'd be sure it's for me.",
  next: "I get it fast. Now give me one button to press.",
  focus: "I get it fast, but the buttons compete. Pick one.",
  short: "I get it, but the headline could lose a few words.",
  speed: "I get it, once it finishes loading. Make it quicker.",
  phone: "I get it on a laptop. On my phone it's a shrunken desktop page.",
  https: "I get it, but my browser warns me it isn't secure.",
};
const ORDER = ["headline", "plain", "who", "next", "focus", "short", "speed", "phone", "https"];

function sentenceFor(verdict, checks) {
  const failed = new Set(checks.filter((k) => !k.pass).map((k) => k.id));
  const first = ORDER.find((id) => failed.has(id));
  if (verdict === "ALIVE") return TIP[first] || ALIVE_SAY;
  return first ? SAY[first] : "Close, but the small things add up to a page I'd scroll past.";
}
