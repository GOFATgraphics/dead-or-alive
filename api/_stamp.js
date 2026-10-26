// A free stamp from the homepage: screenshot the first screen, read the page, score it with the rules in
// _rules.js, draw the stamp, and publish it. No AI. If the page can't be captured or read, a note with the
// reason is saved instead and the homepage says so.
// Env: BLOB_READ_WRITE_TOKEN. Optional: MICROLINK_API_KEY.
import { head, put } from "@vercel/blob";
import { resultId } from "./_lib.js";
import { inspect } from "./_inspect.js";
import { capture } from "./_shot.js";
import { scorePage } from "./_rules.js";
import { publishStamp, publicOrigin } from "./_publish.js";
import { saveIcon } from "./_icon.js";

const notePath = (id) => `stamps/${id}.json`;
const BLOB_OPTS = { access: "public", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60, contentType: "application/json" };

async function saveFailure(id, pageUrl, reason) {
  const note = { pageUrl, failed: String(reason || "Unknown error").slice(0, 300), createdAt: new Date().toISOString() };
  await put(notePath(id), JSON.stringify(note), BLOB_OPTS).catch(() => {});
  return note;
}

// The failure note for one result id, or null. Only failures are saved; a success is the published stamp.
export async function stampNote(id) {
  try {
    const meta = await head(notePath(id));
    const r = await fetch(meta.url, { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch (_) {
    return null;
  }
}

// A snapshot built from the rendered page alone, for sites that block direct requests.
function fromBrowser(pageUrl, r) {
  const missing = [];
  if (!r.title) missing.push("title");
  if (!r.description) missing.push("description");
  for (const t of ["og:title", "og:image", "viewport"]) if (!r.tags?.[t]) missing.push(t);
  return {
    blocked: true,
    error: "This site blocks automated requests, so speed, size, and stack weren't checked.",
    https: pageUrl.startsWith("https:"),
    title: r.title,
    missing,
    content: { h1: r.h1, ctas: r.ctas, description: r.description },
    checkedAt: new Date().toISOString(),
  };
}

// Which parts of the first screen get a marker circle, as boxes in thousandths of the screenshot.
// ALIVE: the headline and the main button, in green. DEAD and COPE: what failed, in red or amber —
// the headline when it's missing the point, the buttons when they compete or none says what to do.
const HEAD_CHECKS = ["plain", "short", "who"];
export function circlesFor(layout, verdict, checks) {
  if (!layout) return [];
  const failed = new Set(checks.filter((k) => !k.pass && !k.skip).map((k) => k.id));
  const { w: W, h: H, head } = layout;
  // Buttons in the hero, near the headline; header buttons (top strip) don't count.
  const hero = layout.buttons.filter((b) => b[1] > H * 0.1 && (!head || (b[1] >= head[1] - 40 && b[1] <= head[1] + head[3] + H * 0.42)));
  const union = (bs) => {
    const x1 = Math.min(...bs.map((b) => b[0])), y1 = Math.min(...bs.map((b) => b[1]));
    const x2 = Math.max(...bs.map((b) => b[0] + b[2])), y2 = Math.max(...bs.map((b) => b[1] + b[3]));
    return [x1, y1, x2 - x1, y2 - y1];
  };
  const boxes = [];
  if (verdict === "ALIVE") {
    if (head) boxes.push(head);
    if (hero.length) boxes.push(hero[0]);
  } else {
    if (head && HEAD_CHECKS.some((id) => failed.has(id))) boxes.push(head);
    if (hero.length && (failed.has("focus") || failed.has("next"))) boxes.push(union(hero));
    if (!boxes.length && head) boxes.push(head);
  }
  const clamp = (n, max) => Math.max(0, Math.min(max, n));
  return boxes.slice(0, 3).map((b) => {
    const x = clamp(b[0], W), y = clamp(b[1], H);
    return {
      x: Math.round((x / W) * 1000),
      y: Math.round((y / H) * 1000),
      w: Math.round((clamp(b[0] + b[2], W) - x) / W * 1000),
      h: Math.round((clamp(b[1] + b[3], H) - y) / H * 1000),
    };
  }).filter((b) => b.w > 4 && b.h > 4);
}

// The screenshot is retried once; a page that never renders can't be stamped.
async function captureTwice(pageUrl) {
  try {
    return await capture(pageUrl);
  } catch (err) {
    console.error("Capture failed, retrying:", pageUrl, err.message);
    return capture(pageUrl);
  }
}

export async function processStamp(jobId, pageUrl) {
  const id = resultId(jobId);
  let shot, snapshot;
  try {
    [shot, snapshot] = await Promise.all([captureTwice(pageUrl), inspect(pageUrl).catch((err) => ({ error: err.message }))]);
  } catch (err) {
    return saveFailure(id, pageUrl, err.message);
  }
  // Many sites with cookie walls or bot protection refuse our direct request (403, 503, a timeout) but
  // show a real browser the page. Then the stamp is scored from what the browser saw, without speed and size.
  const blocked = !!snapshot.error || snapshot.status >= 400;
  if (blocked) {
    if (!shot.rendered) return saveFailure(id, pageUrl, snapshot.error || `The page answered ${snapshot.status}.`);
    snapshot = fromBrowser(pageUrl, shot.rendered);
  }

  const { verdict, score, sentence, checks } = scorePage(snapshot, shot.rendered);
  try {
    // Loaded only here, so routes that just read stamps don't carry the canvas library.
    const { renderStamp } = await import("./_render.js");
    // The result page frames the first screen itself, so the circled screenshot (no stamp, no strip) is the image.
    const boxes = circlesFor(shot.rendered?.layout, verdict, checks);
    const [{ shot: clean }, icon] = await Promise.all([
      renderStamp({ jpg: shot.jpg, boxes, verdict, sentence }),
      saveIcon(id, pageUrl, [snapshot.icon, shot.rendered?.icon]).catch(() => ""),
    ]);
    return await publishStamp({
      orderId: jobId,
      pageUrl,
      verdict,
      sentence,
      image: clean,
      shot: clean,
      focus: boxes.length ? { top: Math.min(...boxes.map((b) => b.y)) / 1000, bottom: Math.max(...boxes.map((b) => b.y + b.h)) / 1000 } : null,
      sendMail: false,
      origin: publicOrigin(),
      extra: { snapshot, score, checks, icon },
    });
  } catch (err) {
    console.error("Publish failed:", jobId, err);
    return saveFailure(id, pageUrl, `Publishing failed: ${err.message || err}`);
  }
}
