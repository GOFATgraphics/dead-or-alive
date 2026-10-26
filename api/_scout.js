// The Kill Sheet, made the moment it's paid for: a fresh stamp of the first screen, a scout of the whole page
// (its HTML top to bottom, plus a full-page screenshot), rewrite drafts for the headline, subhead, and button,
// and 3 to 5 fixes ranked by impact. Rules, not AI: every finding quotes what it was found by.
// Saved as report:<email> and shown in the dashboard.
import { put } from "@vercel/blob";
import crypto from "node:crypto";
import { inspect } from "./_inspect.js";
import { fullPageShot } from "./_shot.js";
import { ACTION, FOG, FOR, WHO } from "./_rules.js";
import { stampNow } from "./_stamp.js";
import { get, set } from "./_store.js";

export const reportKey = (email) => `report:${email}`;

const decode = (s) =>
  String(s || "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const textOf = (html) => decode(String(html || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

// What the whole page says and does, read from its HTML.
export function scoutHtml(html) {
  const body = String(html || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ");
  const text = textOf(body);
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const sections = [...body.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => clip(textOf(m[1]), 90)).filter(Boolean).slice(0, 20);

  // Every button and link label that asks for an action, with where it sits on the page (0 top, 1 bottom).
  const ctas = [...body.matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => ({ text: clip(textOf(m[2]), 50), at: m.index / Math.max(1, body.length) }))
    .filter((c) => c.text && c.text.length <= 50 && ACTION.test(c.text));
  const ctaLabels = [...new Set(ctas.map((c) => c.text.toLowerCase()))];

  const forms = [...body.matchAll(/<form\b[\s\S]*?<\/form>/gi)].map((m) => {
    const f = m[0];
    const inputs = (f.match(/<input\b[^>]*>/gi) || []).filter((t) => !/type=["']?(hidden|submit|button|checkbox|radio)/i.test(t)).length;
    return inputs + (f.match(/<(select|textarea)\b/gi) || []).length;
  });
  const imgs = body.match(/<img\b[^>]*>/gi) || [];
  const logoImgs = imgs.filter((t) => /alt=["'][^"']*logo/i.test(t) || /logo/i.test((t.match(/src=["']([^"']*)/i) || [])[1] || "")).length;
  const sentences = text.split(/[.!?]+\s/).filter((s) => s.split(/\s+/).length > 3);
  const avgSentence = sentences.length ? Math.round(words.length / sentences.length) : 0;
  const you = (lower.match(/\b(you|your|you're|yours)\b/g) || []).length;
  const we = (lower.match(/\b(we|our|us|we're)\b/g) || []).length;
  const fog = FOG.filter((w) => lower.includes(w));
  const stat = text.match(/\b\d[\d,.]*\s?(?:k|m)?\+?\s+(?:users|customers|teams|companies|founders|businesses|people|downloads|reviews|creators|stores|members|developers)\b/i);
  const testimonial = /testimonial|what (?:our )?(?:customers|users|people|clients) (?:say|are saying)|loved by|trusted by|used by|reviews?\b|★|rated \d|case stud/i.exec(text);

  return {
    words: words.length,
    sections,
    ctaCount: ctas.length,
    ctaLabels: ctaLabels.slice(0, 12),
    ctaBelowFold: ctas.some((c) => c.at > 0.35),
    closingCta: ctas.some((c) => c.at > 0.7),
    forms: forms.length,
    longestForm: forms.length ? Math.max(...forms) : 0,
    images: imgs.length,
    imagesWithoutAlt: imgs.filter((t) => !/\balt=/i.test(t)).length,
    logos: logoImgs,
    proof: testimonial ? clip(testimonial[0], 40) : "",
    stat: stat ? stat[0] : "",
    pricing: /(?:\$|€|£)\s?\d|\/mo\b|per month|\bpricing\b/i.test(text),
    faq: /<details\b/i.test(body) || /\bfaq\b|frequently asked/i.test(lower),
    riskReversal: (lower.match(/money.?back|refund|guarantee|cancel anytime|no credit card|free trial|risk.?free|no card/) || [""])[0],
    video: /<video\b|youtube(?:-nocookie)?\.com\/embed|player\.vimeo\.com|wistia|loom\.com\/embed/i.test(html),
    contact: /mailto:|\bcontact\b/i.test(body),
    avgSentence,
    you,
    we,
    fog: fog.slice(0, 6),
  };
}

// Rewrite drafts from the page's own words, shaped to pass every first-screen check:
// short, plain, names who it's for, one clear button. Brackets mark what only the owner knows.
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const lowerFirst = (s) => (s && !/^[A-Z]{2}/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const stripFog = (s) => FOG.reduce((t, w) => t.replace(new RegExp(`\\b${w.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "gi"), ""), s).replace(/\s{2,}/g, " ").trim();

function productName(title, host) {
  const parts = String(title || "").split(/\s[|\-–—:·]\s/).map((p) => p.trim()).filter(Boolean);
  const short = parts.filter((p) => p.split(/\s+/).length <= 3).sort((a, b) => a.length - b.length)[0];
  if (short) return short;
  const label = String(host || "").replace(/^www\./, "").split(".")[0];
  return cap(label);
}

// The plain "what it does" from the subhead or description: the first clause, the product's own name taken off.
function whatItDoes(text, name) {
  let s = String(text || "").split(/(?<=[.!?])\s/)[0].replace(/[.!?]+$/, "").trim();
  if (name) s = s.replace(new RegExp(`^${name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\s+(is|helps you|helps|lets you|makes it easy to)\\s+`, "i"), "");
  s = s.replace(/^(an?|the)\s+(\w+\s+){0,3}?(that|which)\s+(helps you|helps|lets you)\s+/i, "");
  s = stripFog(s).replace(/^(helps you|helps|lets you|we help you|we help)\s+/i, "");
  const w = s.split(/\s+/).filter(Boolean);
  return w.length ? w.slice(0, 8).join(" ").replace(/[,;:]$/, "") : "";
}

function audienceOf(texts) {
  for (const t of texts) {
    const m = String(t || "").match(FOR);
    if (m) return m[1].trim().split(/\s+/).slice(0, 4).join(" ");
    const w = String(t || "").match(WHO);
    if (w) return w[0];
  }
  return "";
}

function buttonFor(page, name) {
  const t = page.lower;
  if (/free trial/.test(t)) return "Start your free trial";
  if (/waitlist|wait list|early access/.test(t)) return "Join the waitlist";
  if (/book a (?:call|demo)|schedule a demo|get a demo/.test(t)) return "Book a 15-minute demo";
  if (/app store|google play/.test(t)) return `Get ${name} on your phone`;
  if (/\bfree\b|no card|no credit card/.test(t)) return `Try ${name} free`;
  return `Get started with ${name}`;
}

export function rewrites({ h1, subhead, description, title, host, ctas, fullText }) {
  const name = productName(title, host);
  const what = whatItDoes(subhead || description || h1, name) || "[what it does, in plain words]";
  const who = audienceOf([h1, subhead, description, title, fullText]) || "[who it's for]";
  const proof = (fullText.match(/\b\d[\d,.]*\s?(?:k|m)?\+?\s+(?:users|customers|teams|companies|founders|businesses|people|downloads|reviews|creators|stores|members|developers)\b/i) || [""])[0];
  const headlines = [
    `${cap(what)} for ${who}.`,
    `${cap(who)}: ${lowerFirst(what)}, without [the slow part].`,
    `The simple way for ${who} to ${lowerFirst(what)}.`,
  ].map((h) => h.replace(/\s{2,}/g, " "));
  const page = { lower: String(fullText || "").toLowerCase() };
  return {
    product: name,
    found: { what, who, proof },
    before: { headline: h1 || "", subhead: subhead || description || "", buttons: (ctas || []).slice(0, 4) },
    headlines,
    subhead: `${name} helps ${who} ${lowerFirst(what)}. ${proof ? `Trusted by ${proof}.` : "[One proof point: a number, a customer, or a result.]"}`,
    button: buttonFor(page, name),
    secondary: "See how it works",
    rules: ["Short enough to read in one glance", "No pitch-deck words", "Says who it's for", "One main button that says what happens next"],
  };
}

// Fixes ranked by how much they cost a stranger: failed first-screen checks first, then what the scout found.
const IMPACT = { High: 3, Medium: 2, Low: 1 };
export function rankFixes(stamp, scout) {
  const out = [];
  for (const k of (stamp?.checks || []).filter((c) => !c.pass && !c.skip)) {
    out.push({ title: k.label, problem: k.detail, fix: k.fix, impact: k.weight >= 4 ? "High" : k.weight >= 2 ? "Medium" : "Low", from: "First-screen check" });
  }
  const s = scout;
  if (s) {
    if (!s.proof && !s.logos && !s.stat) out.push({ title: "Nobody vouches for it", problem: "No testimonials, customer logos, ratings, or usage numbers anywhere on the page.", fix: "Add 2 or 3 short quotes with a real name and face, or the logos of who uses it, right under the first screen.", impact: "High", from: "Page scout" });
    if (s.longestForm > 5) out.push({ title: "The form asks too much", problem: `The longest form has ${s.longestForm} fields.`, fix: "Ask for an email only. Get the rest after they're in.", impact: "High", from: "Page scout" });
    if (!s.closingCta) out.push({ title: "No ask at the end", problem: "Someone who reads to the bottom finds no button to act on.", fix: "Repeat the main button in a closing section with one line on what happens next.", impact: "Medium", from: "Page scout" });
    if (s.ctaLabels.length > 4) out.push({ title: "Too many different asks", problem: `${s.ctaLabels.length} different button labels: ${s.ctaLabels.slice(0, 5).join(", ")}.`, fix: "Pick one main action and use the same words on every main button.", impact: "Medium", from: "Page scout" });
    if (!s.riskReversal) out.push({ title: "Nothing lowers the risk", problem: "No free trial, guarantee, 'no card', or 'cancel anytime' anywhere.", fix: "Say what it costs to try: free, no card, or cancel anytime. Put it under the main button.", impact: "Medium", from: "Page scout" });
    if (s.we > s.you && s.we > 8) out.push({ title: "It talks about itself", problem: `“We/our/us” ${s.we} times, “you/your” ${s.you} times.`, fix: "Rewrite the top sections around what the visitor gets, in 'you' words.", impact: "Medium", from: "Page scout" });
    if (s.fog.length >= 3) out.push({ title: "Pitch-deck words across the page", problem: `Found: ${s.fog.join(", ")}.`, fix: "Swap each for what it actually does, in words a stranger can picture.", impact: "Medium", from: "Page scout" });
    if (!s.pricing) out.push({ title: "No price in sight", problem: "No prices or pricing link found on the page.", fix: "Show the price, or 'free to start', near the main button. Hidden prices read as expensive.", impact: "Low", from: "Page scout" });
    if (!s.faq) out.push({ title: "Questions go unanswered", problem: "No FAQ section.", fix: "Answer the 4 or 5 questions people ask before buying, near the bottom.", impact: "Low", from: "Page scout" });
    if (s.imagesWithoutAlt > 3) out.push({ title: "Images without descriptions", problem: `${s.imagesWithoutAlt} of ${s.images} images have no alt text.`, fix: "Add short alt text. It helps screen readers and search.", impact: "Low", from: "Page scout" });
    if (s.avgSentence > 24) out.push({ title: "Long sentences", problem: `Sentences average ${s.avgSentence} words.`, fix: "Cut to 15 words or fewer. One idea per sentence.", impact: "Low", from: "Page scout" });
  }
  const b = stamp?.snapshot?.browser;
  if (b?.lcp > 4000) out.push({ title: "Slow to show the main content", problem: `Main content appeared after ${(b.lcp / 1000).toFixed(1)}s in a real browser.`, fix: "Compress the hero image, defer scripts below the first screen, and drop unused third-party tags.", impact: "High", from: "Browser measurement" });
  // Duplicates by title, then strongest first; the stable sort keeps first-screen checks ahead within a level.
  const seen = new Set();
  return out.filter((f) => (seen.has(f.title) ? false : seen.add(f.title))).sort((a, b) => IMPACT[b.impact] - IMPACT[a.impact]).slice(0, 5);
}

// Runs the whole Kill Sheet for one account and saves it. Safe to call again (a re-run replaces it).
export async function runScout(email, pageUrl) {
  const key = reportKey(email);
  const started = new Date().toISOString();
  await set(key, { status: "working", url: pageUrl, startedAt: started });
  try {
    const [stamp, page, full] = await Promise.all([stampNow(pageUrl), inspect(pageUrl).catch((e) => ({ error: e.message })), fullPageShot(pageUrl)]);
    const html = page?._raw?.html || "";
    const scout = html ? scoutHtml(html) : null;
    const c = page?.content || stamp?.snapshot?.content || {};
    let fullShot = "";
    if (full) {
      const id = crypto.createHash("sha256").update(`${email}|${started}`).digest("base64url").slice(0, 20);
      fullShot = (await put(`scouts/${id}.jpg`, full, { access: "public", addRandomSuffix: true, contentType: "image/jpeg" }).catch(() => null))?.url || "";
    }
    const report = {
      status: "ready",
      url: pageUrl,
      startedAt: started,
      finishedAt: new Date().toISOString(),
      stamp: stamp && !stamp.failed ? { id: stamp.id, verdict: stamp.verdict, score: stamp.score, sentence: stamp.sentence, image: stamp.image } : null,
      stampError: stamp?.failed ? stamp.failed : "",
      fullShot,
      scout,
      scoutError: html ? "" : page?.error || "The page blocked our direct request, so the scout used the first screen only.",
      rewrites: rewrites({
        h1: c.h1 || "",
        subhead: c.subhead || "",
        description: c.description || "",
        title: page?.title || stamp?.snapshot?.title || "",
        host: new URL(pageUrl).hostname,
        ctas: c.ctas || [],
        fullText: html ? textOf(html.replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ")).slice(0, 20000) : `${c.h1 || ""} ${c.subhead || ""} ${c.description || ""}`,
      }),
      fixes: rankFixes(stamp && !stamp.failed ? stamp : null, scout),
    };
    await set(key, report);
    return report;
  } catch (err) {
    const failed = { status: "failed", url: pageUrl, startedAt: started, error: String(err?.message || err).slice(0, 300) };
    await set(key, failed);
    return failed;
  }
}

export const readReport = (email) => get(reportKey(email));
