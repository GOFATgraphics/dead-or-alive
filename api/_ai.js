// The automated half of a stamp: screenshot the first screen (desktop and phone), take the stack and speed
// snapshot, have Claude read the screenshots, and save a draft.
// In auto mode (STAMP_MODE=auto) a confident, problem-free draft is published straight away. If it isn't,
// the whole run is tried once more, and if that still fails the order is refunded and the customer told.
// In review mode (STAMP_MODE unset) every draft waits in the desk instead.
// Env: ANTHROPIC_API_KEY, BLOB_READ_WRITE_TOKEN. Optional: MICROLINK_API_KEY (paid screenshot plan), STAMP_MODE.
import Anthropic from "@anthropic-ai/sdk";
import { head, list, put } from "@vercel/blob";
import { VERDICTS, orderPageUrl, refundPolarOrder, resultId } from "./_lib.js";
import { inspect } from "./_inspect.js";
import { publishStamp, publicOrigin, sendRefundEmail } from "./_publish.js";
import { checkPageUrl, pageKind } from "../src/url.js";

export const VIEWPORT = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844, scale: 2 };
const MODEL = "claude-opus-5-5";

export const aiReady = () => Boolean(process.env.ANTHROPIC_API_KEY);
export const autoMode = () => String(process.env.STAMP_MODE || "").toLowerCase() === "auto";

export const draftPaths = (id) => ({ json: `drafts/${id}.json`, image: `drafts/${id}.jpg` });

// One first screen, no scrolling. Microlink runs the browser; with a key it uses the paid plan.
export async function screenshot(pageUrl, phone = false) {
  const key = process.env.MICROLINK_API_KEY;
  const api = new URL(key ? "https://pro.microlink.io/" : "https://api.microlink.io/");
  const q = {
    url: pageUrl,
    screenshot: "true",
    meta: "false",
    "viewport.width": String(phone ? PHONE.width : VIEWPORT.width),
    "viewport.height": String(phone ? PHONE.height : VIEWPORT.height),
    "viewport.deviceScaleFactor": String(phone ? PHONE.scale : 1),
    "viewport.isMobile": String(phone),
    "viewport.hasTouch": String(phone),
    "screenshot.type": "jpeg",
    waitForTimeout: "1500",
  };
  for (const [k, v] of Object.entries(q)) api.searchParams.set(k, v);
  const r = await fetch(api, { headers: key ? { "x-api-key": key } : {} });
  const data = await r.json().catch(() => ({}));
  const shot = data?.data?.screenshot?.url;
  if (!r.ok || data.status !== "success" || !shot) {
    throw new Error(`Screenshot failed: ${data.message || data.code || `status ${r.status}`}.`);
  }
  const img = await fetch(shot);
  if (!img.ok) throw new Error(`Screenshot download failed: status ${img.status}.`);
  return Buffer.from(await img.arrayBuffer());
}

const SYSTEM = `You run the first read for Stamp My Page. A customer paid $1 to learn whether a stranger understands their offer from the first screen of their page, in five seconds, before scrolling. The page can be a website, web app, SaaS homepage, or an app store listing.

You see the first screen on a desktop (${VIEWPORT.width}x${VIEWPORT.height}), and, when available, on a phone. Stamp the desktop screenshot; judge only what is visible in it. Read it the way a busy stranger would: headline first, then subhead, then the main button and anything large.

Decide three things a stranger should get in five seconds:
- product: what it is
- buyer: who it is for
- reason: why they would pay or sign up

Then stamp it:
- DEAD: a stranger cannot say what is being offered.
- COPE: it looks credible, but a stranger cannot name at least one of product, buyer, or reason without decoding.
- ALIVE: a stranger can name all three.

Write one sentence for the customer in the stranger's own voice, first person, the way they'd say it out loud after five seconds. Plain and specific to this page, under 20 words. No jargon, no advice. For example:
- DEAD: "Five seconds in, I still don't know what this does or who it's for."
- COPE: "Clear headline, but five buttons fight over what I should click first."
- ALIVE: "In five seconds I know what it does, who it's for, and what to click."

Mark one to three regions on the desktop screenshot that justify the stamp (usually the headline, and whatever is missing or confusing). Give each as a box in pixels of the desktop screenshot (x and y of the top-left corner, then width and height), fully inside the image, with a label of a few words.

If there is a phone screenshot, say whether the first screen works on a phone: nothing cut off or overflowing sideways, text readable, the main button visible. Note what breaks, in a few words.

If the desktop screenshot shows an error page, a cookie wall covering the page, a login screen, or a blank page, set problem to describe it. If the page can't be judged, the customer is refunded, so say how sure you are.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "sentence", "read", "marks", "mobile", "confidence", "problem"],
  properties: {
    verdict: { type: "string", enum: VERDICTS },
    sentence: { type: "string" },
    read: {
      type: "object",
      additionalProperties: false,
      required: ["product", "buyer", "reason"],
      properties: {
        product: { type: "string", description: "What a stranger thinks it is. Empty if they can't tell." },
        buyer: { type: "string", description: "Who it is for. Empty if they can't tell." },
        reason: { type: "string", description: "Why they'd pay. Empty if they can't tell." },
      },
    },
    marks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["x", "y", "w", "h", "label"],
        properties: {
          x: { type: "integer", description: "Left edge, pixels from the left of the desktop screenshot." },
          y: { type: "integer", description: "Top edge, pixels from the top." },
          w: { type: "integer", description: "Width in pixels." },
          h: { type: "integer", description: "Height in pixels." },
          label: { type: "string", description: "A few words: what this region shows or lacks." },
        },
      },
    },
    mobile: {
      type: "object",
      additionalProperties: false,
      required: ["checked", "ok", "note"],
      properties: {
        checked: { type: "boolean", description: "False when there was no phone screenshot." },
        ok: { type: "boolean" },
        note: { type: "string", description: "What breaks on a phone, or empty when it works." },
      },
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    problem: { type: "string", description: "Empty unless the screenshot can't be judged." },
  },
};

// Store listings are an app's first screen, but they're judged differently from a landing page.
const STORE_NOTE = (store) =>
  `This is the app's ${store} listing, not a landing page. Judge it as a store listing: the icon, app name, subtitle or short description, rating, and the first screenshots a stranger sees before scrolling. Product means what the app does, buyer means who it's for, reason means why they'd install it. Ignore the store's own navigation, menus, and banners; circle parts of the listing itself. `;
const KIND_NOTE = {
  appstore: STORE_NOTE("App Store"),
  playstore: STORE_NOTE("Google Play"),
  login: "This page may sit behind a login. Judge exactly what a logged-out stranger sees here; if it's only a login form, say so in problem. ",
};

// Width and height of a JPEG, read from its header, so boxes are checked against the real image.
export function jpegSize(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

const MIN_BOX = 8;
const MAX_BOXES = 3;

// Checks the AI's answer. Returns the problems found; empty means usable as is.
function problemsWith(out, size) {
  if (!out || typeof out !== "object") return ["the answer was not JSON"];
  const found = [];
  if (!VERDICTS.includes(out.verdict)) found.push("verdict must be DEAD, COPE, or ALIVE");
  if (!String(out.sentence || "").trim()) found.push("sentence is empty");
  const marks = Array.isArray(out.marks) ? out.marks : [];
  if (marks.length > MAX_BOXES) found.push(`give at most ${MAX_BOXES} boxes`);
  marks.forEach((m, i) => {
    const [x, y, w, h] = [m.x, m.y, m.w, m.h].map(Number);
    if (![x, y, w, h].every(Number.isFinite)) return found.push(`box ${i + 1} has missing numbers`);
    if (w < MIN_BOX || h < MIN_BOX) found.push(`box ${i + 1} is too small`);
    if (x < 0 || y < 0 || x + w > size.width || y + h > size.height) {
      found.push(`box ${i + 1} (${x},${y},${w}x${h}) is outside the ${size.width}x${size.height} screenshot`);
    }
  });
  return found;
}

function ask(client, content) {
  return client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });
}

// The AI chooses what: verdict, sentence, which regions to circle. Code checks it.
// A bad answer gets one retry that names the problem. If the boxes are still bad after that,
// the stamp goes ahead without circles; only a missing verdict stops it (the order then waits in the desk).
export async function judge(jpg, pageUrl, phoneJpg = null) {
  const size = jpegSize(jpg) || { width: VIEWPORT.width, height: VIEWPORT.height };
  const client = new Anthropic();
  const base = [
    { type: "text", text: `Desktop (${size.width}x${size.height} pixels):` },
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpg.toString("base64") } },
    ...(phoneJpg
      ? [
          { type: "text", text: "Phone:" },
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: phoneJpg.toString("base64") } },
        ]
      : []),
    { type: "text", text: `${KIND_NOTE[pageKind(pageUrl)] || ""}First screen of ${pageUrl}. Stamp it.` },
  ];

  let out = null, problems = [], response = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const content = attempt === 1 ? base : [...base, { type: "text", text: `Your last answer had problems: ${problems.join("; ")}. Answer again with those fixed.` }];
    response = await ask(client, content);
    if (response.stop_reason === "refusal") throw new Error("The AI declined to judge this page.");
    let parsed = null;
    if (response.stop_reason !== "max_tokens") {
      try {
        parsed = JSON.parse(response.content.find((b) => b.type === "text")?.text || "");
      } catch (_) {}
    }
    problems = problemsWith(parsed, size);
    // Keep the best answer so far: one with a verdict beats one without.
    if (parsed && (!out || VERDICTS.includes(parsed.verdict))) out = parsed;
    if (!problems.length) break;
  }
  if (!out || !VERDICTS.includes(out.verdict) || !String(out.sentence || "").trim()) {
    throw new Error("The AI's answer was unusable twice.");
  }

  // Boxes that still don't fit after the retry are dropped: a stamp without circles beats no stamp.
  const fits = (m) => problemsWith({ verdict: "DEAD", sentence: "x", marks: [m] }, size).length === 0;
  const all = Array.isArray(out.marks) ? out.marks : [];
  const good = all.filter(fits).slice(0, MAX_BOXES);
  return {
    verdict: out.verdict,
    sentence: String(out.sentence).trim().slice(0, 400),
    read: {
      product: String(out.read?.product || ""),
      buyer: String(out.read?.buyer || ""),
      reason: String(out.read?.reason || ""),
    },
    // Stored in thousandths of the screenshot, which is what the drawing code takes.
    marks: good.map((m) => ({
      x: Math.round((m.x / size.width) * 1000),
      y: Math.round((m.y / size.height) * 1000),
      w: Math.round((m.w / size.width) * 1000),
      h: Math.round((m.h / size.height) * 1000),
      why: String(m.label || "").slice(0, 120),
    })),
    droppedMarks: all.length - good.length,
    mobile: phoneJpg && out.mobile?.checked ? { ok: !!out.mobile.ok, note: String(out.mobile.note || "").slice(0, 200) } : null,
    confidence: ["high", "medium", "low"].includes(out.confidence) ? out.confidence : "low",
    problem: String(out.problem || "").slice(0, 300),
    model: response.model,
  };
}

// Screenshot, inspect, judge, and save the draft for one order. Safe to call twice: the second run replaces the first.
// Returns the draft and the desktop screenshot.
async function buildDraft(orderId, rawPageUrl) {
  const checked = checkPageUrl(rawPageUrl);
  if (!checked.url) throw new Error(`The order's page URL is not usable: ${checked.error}`);
  const id = resultId(orderId);
  const p = draftPaths(id);
  // The phone shot and the snapshot are extras: if they fail, the stamp still happens.
  const [jpg, phone, stack] = await Promise.all([
    screenshot(checked.url),
    screenshot(checked.url, true).catch(() => null),
    inspect(checked.url).catch((err) => ({ error: err.message })),
  ]);
  const ai = await judge(jpg, checked.url, phone);
  const opts = { access: "public", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 };
  const image = await put(p.image, jpg, { ...opts, contentType: "image/jpeg" });
  const draft = {
    orderId,
    pageUrl: checked.url,
    image: image.url,
    ...ai,
    snapshot: { ...stack, mobile: ai.mobile },
    createdAt: new Date().toISOString(),
  };
  await put(p.json, JSON.stringify(draft), { ...opts, contentType: "application/json" });
  return { draft, jpg };
}

export async function makeDraft(orderId, rawPageUrl) {
  return (await buildDraft(orderId, rawPageUrl)).draft;
}

// A draft goes out on its own when the AI is reasonably sure and flagged nothing (error page, login wall, blank).
export const autoPublishable = (d) => d.confidence !== "low" && !d.problem;

const BLOB_OPTS = { access: "public", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 };
const saveNote = (orderId, note) =>
  put(draftPaths(resultId(orderId)).json, JSON.stringify(note), { ...BLOB_OPTS, contentType: "application/json" });

// When a step fails, the order isn't lost: a note is saved in its place so it shows in the desk with the reason.
async function saveFailure(orderId, pageUrl, err, extra = {}) {
  const note = { orderId, pageUrl, failed: String(err?.message || err || "Unknown error").slice(0, 300), createdAt: new Date().toISOString(), ...extra };
  await saveNote(orderId, note).catch(() => {});
  return note;
}

// Auto mode gave up on this order: refund it through Polar and tell the customer.
// If Polar won't refund, the note says so and the order stays in the desk.
async function giveUp(order, pageUrl, reason) {
  const refund = await refundPolarOrder(order, reason).then(() => ({ ok: true }), (err) => ({ ok: false, error: err.message }));
  const email = order.customer?.email || order.user?.email || "";
  const mail = refund.ok && email ? await sendRefundEmail(email, { pageUrl }) : { emailed: false };
  return saveFailure(order.id, pageUrl, reason, { refunded: { at: new Date().toISOString(), ...refund, emailed: mail.emailed } });
}

// A paid order arrived (webhook). Review mode: draft it for the desk.
// Auto mode: draft it, publish it when confident, otherwise run the whole thing once more, then refund.
export async function processPaidOrder(order) {
  const pageUrl = orderPageUrl(order);
  const tries = autoMode() ? 2 : 1;
  let built = null, reason = "";
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      built = await buildDraft(order.id, pageUrl);
      if (!autoMode() || autoPublishable(built.draft)) break;
      reason = built.draft.problem || `The AI wasn't sure (${built.draft.confidence} confidence).`;
    } catch (err) {
      console.error("Draft failed:", order.id, `attempt ${attempt}`, err);
      built = null;
      reason = err.message || String(err);
    }
  }
  if (!autoMode()) return built ? built.draft : saveFailure(order.id, pageUrl, reason);
  if (!built || !autoPublishable(built.draft)) return giveUp(order, pageUrl, reason);

  const { draft, jpg } = built;
  try {
    // Loaded only here, so routes that just read drafts don't carry the canvas library.
    const { renderStamp } = await import("./_render.js");
    const { image, shot } = await renderStamp({ jpg, boxes: draft.marks, verdict: draft.verdict, sentence: draft.sentence });
    const out = await publishStamp({
      orderId: order.id,
      email: order.customer?.email || order.user?.email || "",
      pageUrl: draft.pageUrl,
      verdict: draft.verdict,
      sentence: draft.sentence,
      image,
      shot,
      focus: draft.marks.length
        ? { top: Math.min(...draft.marks.map((m) => m.y)) / 1000, bottom: Math.max(...draft.marks.map((m) => m.y + m.h)) / 1000 }
        : null,
      origin: publicOrigin(),
      extra: { snapshot: draft.snapshot },
    });
    const done = { ...draft, autoPublished: { at: new Date().toISOString(), url: out.url, emailed: out.emailed, emailError: out.emailError || "" } };
    await saveNote(order.id, done);
    return done;
  } catch (err) {
    console.error("Publish failed:", order.id, err);
    return giveUp(order, pageUrl, `Publishing failed: ${err.message || err}`);
  }
}

// The saved draft or note for one result id, or null. Reads one file, so it's cheap enough to poll.
export async function draftFor(id) {
  try {
    const meta = await head(draftPaths(id).json);
    const r = await fetch(meta.url, { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch (_) {
    return null;
  }
}

// resultId -> draft JSON URL, for every saved draft.
export async function savedDrafts() {
  const found = new Map();
  let cursor;
  do {
    const page = await list({ prefix: "drafts/", cursor, limit: 1000 });
    for (const b of page.blobs) {
      const m = /^drafts\/([A-Za-z0-9_-]+)\.json$/.exec(b.pathname);
      if (m) found.set(m[1], b.url);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return found;
}

// orderId -> AI verdict, for the given orders that have a draft.
export async function readDraftVerdicts(orderIds) {
  const saved = await savedDrafts();
  const out = new Map();
  await Promise.all(
    orderIds.map(async (id) => {
      const url = saved.get(resultId(id));
      if (!url) return;
      const d = await fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (d && d.verdict) out.set(id, d.verdict);
      else if (d && d.failed) out.set(id, d.refunded?.ok ? "refunded" : "failed");
    })
  );
  return out;
}

export async function readDraft(orderId) {
  const url = (await savedDrafts()).get(resultId(orderId));
  if (!url) return null;
  const r = await fetch(url, { cache: "no-store" });
  return r.ok ? r.json() : null;
}
