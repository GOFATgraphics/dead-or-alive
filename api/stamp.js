// Public. Starts a free stamp: checks the URL, that the page exists and answers, and the daily limits, then
// answers with a job id right away and screenshots, scores (rules, no AI), and publishes in the background.
// The homepage polls /api/status.
// Env: BLOB_READ_WRITE_TOKEN. Optional: MICROLINK_API_KEY, STAMP_IP_LIMIT, STAMP_DAILY_LIMIT.
import crypto from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { processStamp } from "./_stamp.js";
import { sessionEmail } from "./_account.js";
import { takeStamp } from "./_limit.js";
import { precheck } from "./_inspect.js";
import { DESK } from "../src/config.js";
import { KIND_HINT, checkPageUrl, pageKind } from "../src/url.js";
import { monitorAll, pulseAll } from "./_monitor.js";
import { get, set } from "./_store.js";

// The daily Stay Alive run (vercel.json crons): uptime and speed for every member, and the weekly re-stamps.
// Vercel signs cron calls with CRON_SECRET when it's set; without it, only Vercel's cron agent gets in, once a day.
async function cron(req, res) {
  if (req.query?.cron === "pulse") return pulse(req, res);
  const secret = process.env.CRON_SECRET || "";
  const auth = String(req.headers.authorization || "");
  const fromVercel = /vercel-cron/i.test(String(req.headers["user-agent"] || ""));
  if (secret ? auth !== `Bearer ${secret}` : !fromVercel) return res.status(401).json({ error: "Not allowed." });
  const last = await get("cron:monitor").catch(() => null);
  if (!secret && last && Date.now() - last < 20 * 3600000) return res.status(200).json({ skipped: "Ran in the last 20 hours." });
  await set("cron:monitor", Date.now()).catch(() => {});
  const out = await monitorAll();
  res.status(200).json(out);
}

// The frequent uptime run (.github/workflows/uptime.yml calls it every 5 minutes). It only checks pages, so it
// needs no secret: however often it's called, it runs at most once every 4 minutes.
async function pulse(req, res) {
  const last = await get("cron:pulse").catch(() => null);
  if (last && Date.now() - last < 4 * 60000) return res.status(200).json({ skipped: "Ran in the last 4 minutes." });
  await set("cron:pulse", Date.now()).catch(() => {});
  res.status(200).json(await pulseAll());
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") return cron(req, res);
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

  // Real and reachable before anything is spent on it.
  const check = await precheck(page.url);
  if (!check.ok) return res.status(400).json({ error: check.error, code: check.code });

  const gate = await takeStamp(req);
  if (!gate.ok) return res.status(429).json({ error: gate.error, code: "limit" });

  // Signed in (the dashboard's "Stamp a page" lands here): the verdict email goes to
  // the account email. Signed out, nothing changes: no email, no address collected.
  const email = await sessionEmail(req).catch(() => "");
  const job = crypto.randomUUID();
  waitUntil(
    processStamp(job, page.url, email)
      .then((out) => (out?.failed ? gate.giveBack() : null))
      .catch((err) => {
        console.error("Stamp failed:", job, err);
        return gate.giveBack();
      })
  );
  res.status(202).json({ job });
}
