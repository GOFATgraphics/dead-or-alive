// Admin-only. A person pressed Publish in the desk: save the stamp they made and email the customer.
// Env: ADMIN_KEY, BLOB_READ_WRITE_TOKEN. Email: RESEND_API_KEY, MAIL_FROM. Optional: SITE_URL, RESULT_SECRET.
import { VERDICTS, requireAdmin } from "./_lib.js";
import { publicOrigin, publishStamp } from "./_publish.js";
import { readDraft } from "./_ai.js";
import { checkPageUrl } from "../src/url.js";

const MAX_IMAGE = 4 * 1024 * 1024;

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });

  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const verdict = String(b.verdict || "");
  const sentence = String(b.sentence || "").trim().slice(0, 400);
  const checked = checkPageUrl(b.pageUrl);
  if (!checked.url) return res.status(400).json({ error: `The order's page URL is not usable: ${checked.error}` });
  if (!b.orderId) return res.status(400).json({ error: "Missing order." });
  if (!VERDICTS.includes(verdict)) return res.status(400).json({ error: "Pick DEAD, COPE, or ALIVE." });
  if (!sentence) return res.status(400).json({ error: "Write the sentence." });
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.image || ""));
  if (!m) return res.status(400).json({ error: "Add the screenshot." });
  const image = Buffer.from(m[1], "base64");
  if (image.length > MAX_IMAGE) return res.status(413).json({ error: "Screenshot is too big. Crop it to the first screen." });
  // The circled screenshot without stamp or sentence, for the share cards. Optional.
  const s = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.shot || ""));
  const shot = s ? Buffer.from(s[1], "base64") : null;

  // The stack and speed snapshot rides along from the AI draft, when there is one.
  const draft = await readDraft(String(b.orderId)).catch(() => null);
  try {
    const out = await publishStamp({
      orderId: String(b.orderId),
      email: String(b.email || "").trim(),
      pageUrl: checked.url,
      verdict,
      sentence,
      image,
      shot: shot && shot.length <= MAX_IMAGE ? shot : null,
      sendMail: b.sendEmail !== false,
      origin: publicOrigin(req),
      extra: draft?.snapshot ? { snapshot: draft.snapshot } : {},
    });
    res.status(200).json(out);
  } catch (_) {
    res.status(500).json({ error: "Could not save the stamp. Is Vercel Blob connected?" });
  }
}
