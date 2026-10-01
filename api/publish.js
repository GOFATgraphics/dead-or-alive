// Admin-only. Publishes a stamp: saves the image and verdict, then emails the customer their link.
// Env: ADMIN_KEY, BLOB_READ_WRITE_TOKEN. Email: RESEND_API_KEY, MAIL_FROM. Optional: SITE_URL, RESULT_SECRET.
import { put } from "@vercel/blob";
import { VERDICTS, escapeHtml, paths, requireAdmin, resultId, siteOrigin } from "./_lib.js";
import { checkPageUrl } from "../src/url.js";

const COLOR = { DEAD: "#d92d33", COPE: "#c26a05", ALIVE: "#138a43" };
const MAX_IMAGE = 4 * 1024 * 1024;

function emailHtml({ verdict, sentence, host, image, link }) {
  const e = escapeHtml;
  return `<!doctype html><html><body style="margin:0;background:#f6f5fc;color:#12132a;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px" cellpadding="0" cellspacing="0">
<tr><td style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#5d6180">We looked at ${e(host)}</td></tr>
<tr><td style="padding-top:12px;font-size:56px;font-weight:800;letter-spacing:-2px;line-height:1;color:${COLOR[verdict]}">${verdict}</td></tr>
<tr><td style="padding-top:16px;font-size:15px;line-height:1.5">${e(sentence)}</td></tr>
<tr><td style="padding-top:24px"><a href="${e(link)}"><img src="${e(image)}" width="560" alt="Your first screen, circled and stamped ${verdict}." style="display:block;width:100%;height:auto;border:1px solid #e6e3f1;border-radius:12px"></a></td></tr>
<tr><td style="padding-top:24px"><a href="${e(link)}" style="display:inline-block;background:#12132a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:12px;padding:14px 22px">See your stamp</a></td></tr>
<tr><td style="padding-top:32px;font-size:12px;color:#5d6180">DEAD OR ALIVE. First screen. Five seconds. One stamp.</td></tr>
</table></td></tr></table></body></html>`;
}

async function sendEmail(to, data) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) return { emailed: false, emailError: "Email is not set up (RESEND_API_KEY, MAIL_FROM)." };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `${data.verdict}. We looked at ${data.host}.`,
      html: emailHtml(data),
      text: `${data.verdict}.\n\n${data.sentence}\n\nSee your stamp: ${data.link}\n\nDEAD OR ALIVE`,
    }),
  }).catch(() => null);
  if (!r || !r.ok) return { emailed: false, emailError: `Resend said ${r ? r.status : "nothing"}.` };
  return { emailed: true };
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });

  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const verdict = String(b.verdict || "");
  const sentence = String(b.sentence || "").trim().slice(0, 400);
  const email = String(b.email || "").trim();
  const sendMail = b.sendEmail !== false;
  const checked = checkPageUrl(b.pageUrl);
  if (!checked.url) return res.status(400).json({ error: `The order's page URL is not usable: ${checked.error}` });
  const pageUrl = new URL(checked.url);
  if (!b.orderId) return res.status(400).json({ error: "Missing order." });
  if (!VERDICTS.includes(verdict)) return res.status(400).json({ error: "Pick DEAD, COPE, or ALIVE." });
  if (!sentence) return res.status(400).json({ error: "Write the sentence." });
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.image || ""));
  if (!m) return res.status(400).json({ error: "Add the screenshot." });
  const image = Buffer.from(m[1], "base64");
  if (image.length > MAX_IMAGE) return res.status(413).json({ error: "Screenshot is too big. Crop it to the first screen." });

  const id = resultId(b.orderId);
  const p = paths(id);
  const opts = { access: "public", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 };
  let imageUrl;
  try {
    imageUrl = (await put(p.image, image, { ...opts, contentType: "image/jpeg" })).url;
    const record = {
      id,
      verdict,
      sentence,
      pageUrl: pageUrl.toString(),
      host: pageUrl.hostname.replace(/^www\./, ""),
      image: `${imageUrl}?v=${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    await put(p.json, JSON.stringify(record), { ...opts, contentType: "application/json" });
    const link = `${siteOrigin(req)}/v/${id}`;
    const mail = sendMail && email ? await sendEmail(email, { ...record, link }) : { emailed: false };
    res.status(200).json({ url: link, ...mail });
  } catch (err) {
    res.status(500).json({ error: "Could not save the stamp. Is Vercel Blob connected?" });
  }
}
