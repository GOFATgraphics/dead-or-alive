// Public. Starts a free stamp: checks the URL and the daily limits, answers with a job id right away,
// and screenshots, scores (rules, no AI), and publishes in the background. The homepage polls /api/status.
// Env: BLOB_READ_WRITE_TOKEN. Optional: MICROLINK_API_KEY, STAMP_IP_LIMIT, STAMP_DAILY_LIMIT.
import crypto from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { processStamp } from "./_stamp.js";
import { takeStamp } from "./_limit.js";
import { DESK } from "../src/config.js";
import { KIND_HINT, checkPageUrl, pageKind } from "../src/url.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!DESK.queueOpen || !process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: "The stamp is resting. Try again shortly." });
  }

  let b = req.body;
  if (typeof b === "string") {
    try {
      b = JSON.parse(b);
    } catch (_) {
      b = {};
    }
  }
  const page = checkPageUrl(b?.page_url);
  if (!page.url) return res.status(400).json({ error: page.error, code: page.code });
  const kind = pageKind(page.url);
  if (["download", "appstore", "playstore"].includes(kind)) return res.status(400).json({ error: KIND_HINT[kind], code: kind });

  const gate = await takeStamp(req);
  if (!gate.ok) return res.status(429).json({ error: gate.error, code: "limit" });

  // Random and only known to this browser, so it stands in for a login while the stamp is made.
  const job = crypto.randomUUID();
  waitUntil(processStamp(job, page.url).catch((err) => console.error("Stamp failed:", job, err)));
  res.status(202).json({ job });
}
