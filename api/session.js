// Admin-only. Checks the key so the desk opens even before Polar or anything else is connected,
// and reports which services are set up.
import { polarReady, requireAdmin } from "./_lib.js";
import { redisReady } from "./_redis.js";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  res.status(200).json({
    ok: true,
    setup: {
      polar: polarReady(),
      blob: !!process.env.BLOB_READ_WRITE_TOKEN,
      email: !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM),
      analytics: redisReady(),
      siteUrl: !!process.env.SITE_URL,
      contact: !!process.env.CONTACT_EMAIL,
      queueLimit: Math.max(1, parseInt(process.env.QUEUE_LIMIT || "10", 10) || 10),
    },
  });
}
