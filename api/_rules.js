// The free stamp, decided by rules, not AI. Every check is something a stranger feels in their first five
// seconds (can I tell what this is, who it's for, what to click) or something that slows those seconds down
// (speed, phone, https, share preview). Each check has a weight; the share of weight passed is the score.
//   ALIVE: 80+ and a clear headline.  COPE: 55+.  DEAD: below 55, or no headline at all.
// Input: the snapshot from _inspect.js, plus what the rendered page showed (from _shot.js capture), if anything.
// Output: { verdict, score, sentence, checks: [{ id, label, pass, detail, fix, weight, skip? }] }.
// A skipped check (not measurable) counts neither way and shows as not measured.

// Words that sound like a pitch deck and say nothing a stranger can picture.
export const FOG = [
  "reimagine", "reimagined", "revolutionize", "revolutionise", "redefine", "unlock", "unleash", "empower", "elevate",
  "supercharge", "synergy", "seamless", "next-gen", "next generation", "cutting-edge", "game-changing", "game changer",
  "innovative", "world-class", "best-in-class", "all-in-one", "ai-native", "ai-powered", "future of", "transform",
  "the way you work", "what's next", "limitless", "frictionless", "holistic", "paradigm", "leverage", "disrupt",
];
export const ACTION = /\b(try|start|get|sign ?up|join|book|buy|order|shop|download|install|request|subscribe|create|build|launch|claim|see pricing|pricing|demo|contact|talk to|apply|register|stamp|check|scan|audit|test|analyse|analyze|verify|discover|find|see|watch|learn|explore|compare|calculate|measure|score|grade|run|free)\b/i;
// Who it's for: "for <someone>" (not "for free", "for you", "for everyone"…), or a named audience anywhere in the
// headline, subhead, description, or title. The words found are quoted back, so the result shows its evidence.
export const FOR = /\b(?:made |built |designed |perfect |ideal |tools? |software |platform |app )?for\s+(?!free\b|you\b|your\s?self\b|yourself\b|everyone\b|anyone\b|everybody\b|all\b|good\b|example\b|more\b|less\b|life\b|now\b|today\b|real\b|years?\b|minutes?\b|seconds?\b|days?\b|the (?:first|best|price|win|future|rest)\b|a (?:fraction|few|while)\b|every(?:one|thing)?\b|whatever\b|instance\b)([a-z][\w'’-]*(?:\s+(?:and\s+|&\s+|on\s+|in\s+|of\s+|who\s+|at\s+)?[a-z][\w'’-]*){0,4})/i;
export const WHO = /\b(founders?|co-?founders?|startups?|indie (?:hackers?|makers?|devs?)|solo(?:preneurs?| founders?)|makers?|creators?|developers?|devs|engineers?|engineering teams?|designers?|marketers?|marketing teams?|growth teams?|sales (?:teams?|reps?)|recruiters?|hr teams?|product (?:teams?|managers?)|freelancers?|agencies|consultants?|coaches|small business(?:es)?|smbs?|enterprises?|e-?commerce (?:brands?|stores?)|shopify (?:stores?|merchants?|brands?)|online stores?|sellers?|merchants?|creators?|youtubers?|podcasters?|writers?|bloggers?|newsletter (?:writers?|creators?)|students?|teachers?|educators?|parents?|families|doctors?|clinics?|dentists?|therapists?|lawyers?|law firms?|accountants?|bookkeepers?|real estate (?:agents?|teams?)|realtors?|landlords?|restaurants?|cafes|gyms?|nonprofits?|churches|b2b|saas (?:founders?|teams?|companies)|remote teams?|support teams?|ops teams?|finance teams?|investors?|traders?|gamers?|streamers?|musicians?|artists?|photographers?|travell?ers?)\b/i;

const words = (s) => String(s || "").split(/\s+/).filter(Boolean);
// A time in words that never rounds a real measurement down to 0.0s: under a second, show milliseconds.
const fmtMs = (ms) => ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
const fogIn = (s) => FOG.filter((w) => String(s || "").toLowerCase().includes(w));
const unique = (list) => [...new Set(list.map((t) => t.toLowerCase()))];

export function scorePage(snapshot, rendered = null) {
  const s = snapshot || {};
  const c = s.content || {};
  const h1 = (rendered?.h1 || c.h1 || "").trim();
  const ctas = unique([...(rendered?.ctas || []), ...(rendered ? [] : c.ctas || [])]);
  const actions = ctas.filter((t) => ACTION.test(t));
  const subhead = (rendered?.layout?.sub || rendered?.subhead || c.subhead || "").trim();
  const pitch = `${h1} ${subhead} ${c.description || ""} ${s.title || ""}`;
  // Where the audience is named, in order of how visible that place is.
  const audience = (() => {
    for (const [where, text] of [["headline", h1], ["subhead", subhead], ["description", c.description], ["title", s.title]]) {
      const m = String(text || "").match(FOR) || String(text || "").match(WHO);
      if (m) return { where, words: m[0].trim().slice(0, 80) };
    }
    return null;
  })();
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
      pass: !!audience,
      detail: audience
        ? `Names an audience in the ${audience.where}: “${audience.words}”.`
        : `No audience named in the headline${subhead ? ", subhead" : ""}, description, or title.`,
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
      // A real browser's largest contentful paint when we have it; otherwise how fast the HTML arrived.
      pass: s.browser?.lcp > 0 ? s.browser.lcp <= 2500 : s.loadMs > 0 && s.loadMs <= 2500,
      detail: s.browser?.lcp > 0
        ? `Main content appeared in ${fmtMs(s.browser.lcp)} (largest contentful paint, measured in a real browser).`
        : s.loadMs
          ? `HTML arrived in ${fmtMs(s.loadMs)}.`
          : "Couldn't time it.",
      fix: "Get the main content on screen in under 2.5 seconds: compress the hero image, trim redirects, and move heavy scripts below the fold.",
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

  // A site that blocks direct requests can't be timed or weighed: those checks drop out instead of failing.
  if (s.blocked) {
    for (const k of checks) {
      const measured = k.id === "speed" && s.browser?.lcp > 0;
      if ((k.id === "speed" || k.id === "weight") && !measured) Object.assign(k, { skip: true, pass: true, detail: "Not measured: the site blocks automated requests." });
    }
  }
  const scored = checks.filter((k) => !k.skip);
  const total = scored.reduce((n, k) => n + k.weight, 0);
  const got = scored.reduce((n, k) => n + (k.pass ? k.weight : 0), 0);
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
