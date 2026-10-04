// The automated half of a stamp: screenshot the first screen (desktop and phone), take the stack and speed
// snapshot, have Claude read the screenshots, and save a draft.
// In review mode a person checks every draft in the desk. In auto mode (STAMP_MODE=auto) a confident,
// problem-free draft is published straight away and everything else still waits for a person.
// Env: ANTHROPIC_API_KEY, BLOB_READ_WRITE_TOKEN. Optional: MICROLINK_API_KEY (paid screenshot plan), STAMP_MODE.
import Anthropic from "@anthropic-ai/sdk";
import { list, put } from "@vercel/blob";
import { VERDICTS, orderPageUrl, resultId } from "./_lib.js";
import { inspect } from "./_inspect.js";
import { publishStamp, publicOrigin } from "./_publish.js";
import { checkPageUrl } from "../src/url.js";

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

Write one sentence for the customer. Start it with "A stranger" and say plainly what they get or miss before they scroll. No jargon, no advice list, under 25 words.

Mark one to three regions on the screenshot that justify the stamp (usually the headline, and whatever is missing or confusing). Give each as a box in thousandths of the screenshot's width and height (0 to 1000), with a short reason.

If there is a phone screenshot, say whether the first screen works on a phone: nothing cut off or overflowing sideways, text readable, the main button visible. Note what breaks, in a few words.

If the desktop screenshot shows an error page, a cookie wall covering the page, a login screen, or a blank page, set problem to describe it. A person will check your work before the customer sees anything, so say how sure you are.`;

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
        required: ["x", "y", "w", "h", "why"],
        properties: {
          x: { type: "integer" },
          y: { type: "integer" },
          w: { type: "integer" },
          h: { type: "integer" },
          why: { type: "string" },
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

const clamp = (n) => Math.min(1000, Math.max(0, Math.round(Number(n) || 0)));

export async function judge(jpg, pageUrl, phoneJpg = null) {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Desktop:" },
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpg.toString("base64") } },
          ...(phoneJpg
            ? [
                { type: "text", text: "Phone:" },
                { type: "image", source: { type: "base64", media_type: "image/jpeg", data: phoneJpg.toString("base64") } },
              ]
            : []),
          { type: "text", text: `First screen of ${pageUrl}. Stamp it.` },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("The AI declined to judge this page. Stamp it by hand.");
  if (response.stop_reason === "max_tokens") throw new Error("The AI ran out of room. Try again.");
  const text = response.content.find((b) => b.type === "text")?.text || "";
  let out;
  try {
    out = JSON.parse(text);
  } catch (_) {
    throw new Error("The AI answer could not be read. Try again.");
  }
  if (!VERDICTS.includes(out.verdict)) throw new Error("The AI answer had no stamp. Try again.");
  return {
    verdict: out.verdict,
    sentence: String(out.sentence || "").trim().slice(0, 400),
    read: {
      product: String(out.read?.product || ""),
      buyer: String(out.read?.buyer || ""),
      reason: String(out.read?.reason || ""),
    },
    marks: (Array.isArray(out.marks) ? out.marks : [])
      .map((m) => {
        const x = clamp(m.x), y = clamp(m.y);
        return { x, y, w: Math.min(clamp(m.w), 1000 - x), h: Math.min(clamp(m.h), 1000 - y), why: String(m.why || "").slice(0, 200) };
      })
      .filter((m) => m.w > 0 && m.h > 0)
      .slice(0, 4),
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

// Only confident drafts with nothing flagged go out without a person.
export const autoPublishable = (d) => d.confidence === "high" && !d.problem;

// A paid order arrived (webhook). Draft it, and in auto mode publish it when the draft is confident.
export async function processPaidOrder(order) {
  const { draft, jpg } = await buildDraft(order.id, orderPageUrl(order));
  if (!autoMode() || !autoPublishable(draft)) return draft;
  // Loaded only here, so routes that just read drafts don't carry the canvas library.
  const { renderStamp } = await import("./_render.js");
  const image = await renderStamp({ jpg, boxes: draft.marks, verdict: draft.verdict, sentence: draft.sentence });
  const out = await publishStamp({
    orderId: order.id,
    email: order.customer?.email || order.user?.email || "",
    pageUrl: draft.pageUrl,
    verdict: draft.verdict,
    sentence: draft.sentence,
    image,
    origin: publicOrigin(),
    extra: { snapshot: draft.snapshot },
  });
  const done = { ...draft, autoPublished: { at: new Date().toISOString(), url: out.url, emailed: out.emailed, emailError: out.emailError || "" } };
  const opts = { access: "public", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 };
  await put(draftPaths(resultId(order.id)).json, JSON.stringify(done), { ...opts, contentType: "application/json" });
  return done;
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
