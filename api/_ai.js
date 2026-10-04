// The automated half of a stamp: screenshot the first screen, have Claude read it, save a draft.
// A person reviews every draft in the desk before anything reaches the customer.
// Env: ANTHROPIC_API_KEY, BLOB_READ_WRITE_TOKEN. Optional: MICROLINK_API_KEY (paid screenshot plan).
import Anthropic from "@anthropic-ai/sdk";
import { list, put } from "@vercel/blob";
import { VERDICTS, resultId } from "./_lib.js";
import { checkPageUrl } from "../src/url.js";

export const VIEWPORT = { width: 1440, height: 900 };
const MODEL = "claude-opus-5-5";

export const aiReady = () => Boolean(process.env.ANTHROPIC_API_KEY);

export const draftPaths = (id) => ({ json: `drafts/${id}.json`, image: `drafts/${id}.jpg` });

// One desktop first screen, no scrolling. Microlink runs the browser; with a key it uses the paid plan.
export async function screenshot(pageUrl) {
  const key = process.env.MICROLINK_API_KEY;
  const api = new URL(key ? "https://pro.microlink.io/" : "https://api.microlink.io/");
  const q = {
    url: pageUrl,
    screenshot: "true",
    meta: "false",
    "viewport.width": String(VIEWPORT.width),
    "viewport.height": String(VIEWPORT.height),
    "viewport.deviceScaleFactor": "1",
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

You see one screenshot of the first screen at ${VIEWPORT.width}x${VIEWPORT.height}. Judge only what is visible in it. Read it the way a busy stranger would: headline first, then subhead, then the main button and anything large.

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

If the screenshot shows an error page, a cookie wall covering the page, a login screen, or a blank page, set problem to describe it. A person will check your work before the customer sees anything, so say how sure you are.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "sentence", "read", "marks", "confidence", "problem"],
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
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    problem: { type: "string", description: "Empty unless the screenshot can't be judged." },
  },
};

const clamp = (n) => Math.min(1000, Math.max(0, Math.round(Number(n) || 0)));

export async function judge(jpg, pageUrl) {
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
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpg.toString("base64") } },
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
    confidence: ["high", "medium", "low"].includes(out.confidence) ? out.confidence : "low",
    problem: String(out.problem || "").slice(0, 300),
    model: response.model,
  };
}

// Screenshot, judge, and save the draft for one order. Safe to call twice: the second run replaces the first.
export async function makeDraft(orderId, rawPageUrl) {
  const checked = checkPageUrl(rawPageUrl);
  if (!checked.url) throw new Error(`The order's page URL is not usable: ${checked.error}`);
  const id = resultId(orderId);
  const p = draftPaths(id);
  const jpg = await screenshot(checked.url);
  const ai = await judge(jpg, checked.url);
  const opts = { access: "public", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 };
  const image = await put(p.image, jpg, { ...opts, contentType: "image/jpeg" });
  const draft = { orderId, pageUrl: checked.url, image: image.url, ...ai, createdAt: new Date().toISOString() };
  await put(p.json, JSON.stringify(draft), { ...opts, contentType: "application/json" });
  return draft;
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
