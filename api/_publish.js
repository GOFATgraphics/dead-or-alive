// Publishing a stamp: save the image and record, then email the customer their link.
// Used by automatic mode and by the desk's Publish button.
import { put } from "@vercel/blob";
import { escapeHtml, paths, readResult, resultId } from "./_lib.js";
import { pipeline, redisReady } from "./_redis.js";
import { list } from "@vercel/blob";
import { snapshotRows } from "../src/snapshot.js";

const COLOR = { DEAD: "#d92d33", COPE: "#c26a05", ALIVE: "#138a43" };

// The public address of the site. Without a request (webhooks), fall back to env.
export function publicOrigin(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  if (req) {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const proto = req.headers["x-forwarded-proto"] || "https";
    return `${proto}://${host}`;
  }
  return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || "stampmypage.com"}`;
}

function snapshotHtml(snapshot) {
  const rows = snapshotRows(snapshot);
  if (!rows.length) return "";
  const e = escapeHtml;
  const cells = rows
    .map((r) => `<tr><td style="padding:6px 12px 6px 0;color:#5d6180;white-space:nowrap;vertical-align:top">${e(r.label)}</td><td style="padding:6px 0;${r.warn ? "color:#b42228;font-weight:600" : ""}">${e(r.value)}</td></tr>`)
    .join("");
  return `<tr><td style="padding-top:28px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#5d6180">Stack and speed</td></tr>
<tr><td style="padding-top:8px"><table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.4">${cells}</table></td></tr>`;
}

function emailHtml({ verdict, sentence, host, image, link, snapshot }) {
  const e = escapeHtml;
  return `<!doctype html><html><body style="margin:0;background:#f6f5fc;color:#12132a;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px" cellpadding="0" cellspacing="0">
<tr><td style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#5d6180">We looked at ${e(host)}</td></tr>
<tr><td style="padding-top:12px;font-size:56px;font-weight:800;letter-spacing:-2px;line-height:1;color:${COLOR[verdict]}">${verdict}</td></tr>
<tr><td style="padding-top:16px;font-size:15px;line-height:1.5">${e(sentence)}</td></tr>
<tr><td style="padding-top:24px"><a href="${e(link)}"><img src="${e(image)}" width="560" alt="Your first screen, circled and stamped ${verdict}." style="display:block;width:100%;height:auto;border:1px solid #e6e3f1;border-radius:12px"></a></td></tr>
${snapshotHtml(snapshot)}
<tr><td style="padding-top:24px"><a href="${e(link)}" style="display:inline-block;background:#12132a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:12px;padding:14px 22px">See your stamp</a></td></tr>
<tr><td style="padding-top:32px;font-size:12px;color:#5d6180">Stamp My Page. First screen. Five seconds. One stamp.</td></tr>
</table></td></tr></table></body></html>`;
}

async function mail(to, { subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) return { emailed: false, emailError: "Email is not set up (RESEND_API_KEY, MAIL_FROM)." };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], reply_to: process.env.CONTACT_EMAIL || undefined, subject, html, text }),
  }).catch(() => null);
  if (!r || !r.ok) return { emailed: false, emailError: `Resend said ${r ? r.status : "nothing"}.` };
  return { emailed: true };
}

const sendEmail = (to, data) =>
  mail(to, {
    subject: `${data.verdict}. We looked at ${data.host}.`,
    html: emailHtml(data),
    text: [
      `${data.verdict}.`,
      data.sentence,
      snapshotRows(data.snapshot).map((r) => `${r.label}: ${r.value}`).join("\n"),
      `See your stamp: ${data.link}`,
      "Stamp My Page",
    ].filter(Boolean).join("\n\n"),
  });

// Sent when the AI couldn't stamp a page twice and the order was refunded.
export function sendRefundEmail(to, { pageUrl }) {
  const e = escapeHtml;
  let host = pageUrl;
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch (_) {}
  const lines = [
    `We couldn't stamp ${host}, so we've refunded your $1.`,
    "This usually means the page didn't load for us, showed a login or cookie wall, or came up blank. You can try again once a logged-out visitor can see it.",
  ];
  return mail(to, {
    subject: `Refunded: we couldn't stamp ${host}`,
    html: `<!doctype html><html><body style="margin:0;background:#f6f5fc;color:#12132a;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px" cellpadding="0" cellspacing="0">
${lines.map((l) => `<tr><td style="padding-top:12px;font-size:15px;line-height:1.5">${e(l)}</td></tr>`).join("")}
<tr><td style="padding-top:32px;font-size:12px;color:#5d6180">Stamp My Page</td></tr>
</table></td></tr></table></body></html>`,
    text: [...lines, "Stamp My Page"].join("\n\n"),
  });
}

// Stamp numbers make cards feel collectible (#0042). Republishing keeps the number.
// Redis counts when it's connected; otherwise the count of published stamps stands in.
async function stampNumber(id) {
  const existing = await readResult(id);
  if (existing?.number) return existing.number;
  if (redisReady()) {
    try {
      const [n] = await pipeline([["INCR", "stamp:number"]]);
      if (Number(n) > 0) return Number(n);
    } catch (_) {}
  }
  let count = 0, cursor;
  do {
    const page = await list({ prefix: "verdicts/", cursor, limit: 1000 });
    count += page.blobs.filter((b) => /^verdicts\/[A-Za-z0-9_-]+\.json$/.test(b.pathname)).length;
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return count + 1;
}

// image: the finished stamp (JPEG buffer). shot: the circled screenshot alone, for the share cards.
// pageUrl: an already checked URL. Throws if storage fails; a card that fails to draw is skipped.
// focus: { top, bottom } of the circles as fractions of the screenshot height, so the card keeps them in view.
export async function publishStamp({ orderId, email, pageUrl, verdict, sentence, image, shot, focus, sendMail = true, origin, extra = {} }) {
  const id = resultId(orderId);
  const p = paths(id);
  const url = new URL(pageUrl);
  const opts = { access: "public", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 };
  const v = Date.now();
  const imageUrl = (await put(p.image, image, { ...opts, contentType: "image/jpeg" })).url;
  const record = {
    id,
    number: await stampNumber(id),
    verdict,
    sentence,
    pageUrl: url.toString(),
    host: url.hostname.replace(/^www\./, ""),
    image: `${imageUrl}?v=${v}`,
    createdAt: new Date().toISOString(),
    ...extra,
  };
  if (shot) {
    try {
      const { renderCards } = await import("./_card.js");
      const cards = await renderCards(shot, { ...record, focus });
      const [wide, square] = await Promise.all([
        put(p.card, cards.wide, { ...opts, contentType: "image/jpeg" }),
        put(p.square, cards.square, { ...opts, contentType: "image/jpeg" }),
      ]);
      record.card = `${wide.url}?v=${v}`;
      record.cardSquare = `${square.url}?v=${v}`;
    } catch (err) {
      console.error("Share card failed:", err);
    }
  }
  await put(p.json, JSON.stringify(record), { ...opts, contentType: "application/json" });
  const link = `${origin}/v/${id}`;
  const mail = sendMail && email ? await sendEmail(email, { ...record, link }) : { emailed: false };
  return { url: link, ...mail };
}
