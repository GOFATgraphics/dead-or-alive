// Public. Counts one anonymous event: no cookies, no stored IPs.
// A visitor is a hash of IP + browser + a salt that changes every day, so nobody can be followed across days.
import crypto from "node:crypto";
import { pipeline, redisReady } from "./_redis.js";

export const EVENTS = new Set([
  "view", // a page was opened (p: home | result | paid | privacy | terms)
  "form_start", // first click into the homepage form
  "submit_try", // pressed the button
  "submit_error", // form refused the input (err: code)
  "checkout", // sent to Polar
  "queue_closed", // saw the "queue is full" state
  "cta_click", // a "Judge my page" button outside the form
  "share_copy", // shared a result: copied the link, posted to X or LinkedIn, or downloaded the card
  "result_cta", // "Judge another page" from a result page
]);
const PAGES = new Set(["home", "result", "paid", "privacy", "terms"]);
const VERDICTS = new Set(["DEAD", "COPE", "ALIVE"]);
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|whatsapp|telegram|discord|slack|lighthouse|pingdom|uptime/i;
const TTL = 400 * 24 * 3600;

const day = (d = new Date()) => d.toISOString().slice(0, 10);
const clean = (s, max = 40) => String(s || "").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, max);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  const ua = String(req.headers["user-agent"] || "");
  // Respect Global Privacy Control and Do Not Track, skip bots, and do nothing until Redis is connected.
  if (!redisReady() || BOT.test(ua) || req.headers["sec-gpc"] === "1" || req.headers["dnt"] === "1") return res.status(204).end();

  let b = req.body;
  if (typeof b === "string") {
    try {
      b = JSON.parse(b);
    } catch (_) {
      b = {};
    }
  }
  b = b || {};
  const event = String(b.e || "");
  if (!EVENTS.has(event)) return res.status(204).end();
  const page = PAGES.has(b.p) ? b.p : "";
  const verdict = VERDICTS.has(b.v) ? b.v : "";

  const d = day();
  const k = `a:${d}`;
  const cmds = [["INCR", `${k}:e:${event}`]];
  if (page) cmds.push(["INCR", `${k}:e:${event}:${page}`]);
  if (verdict) cmds.push(["INCR", `${k}:e:${event}:v:${verdict}`]);
  if (event === "submit_error" && b.err) cmds.push(["ZINCRBY", `${k}:err`, 1, clean(b.err, 30)]);

  if (event === "view") {
    const salt = crypto.createHmac("sha256", process.env.ANALYTICS_SALT || process.env.ADMIN_KEY || "doa").update(d).digest();
    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "";
    const visitor = crypto.createHmac("sha256", salt).update(ip + "|" + ua).digest("base64url").slice(0, 16);
    cmds.push(["PFADD", `${k}:uv`, visitor]);
    if (page) cmds.push(["PFADD", `${k}:uv:${page}`, visitor]);
    const ref = clean(b.r, 60).replace(/^www\./, "");
    if (ref) cmds.push(["ZINCRBY", `${k}:ref:${page || "other"}`, 1, ref]);
    const country = clean(req.headers["x-vercel-ip-country"], 2).toUpperCase();
    if (country) cmds.push(["ZINCRBY", `${k}:country`, 1, country]);
    cmds.push(["ZINCRBY", `${k}:device`, 1, /Mobi|Android|iPhone|iPod/i.test(ua) ? "mobile" : /iPad|Tablet/i.test(ua) ? "tablet" : "desktop"]);
  }
  // Keep a little over a year of history.
  const keys = [...new Set(cmds.map((c) => c[1]))];
  for (const key of keys) cmds.push(["EXPIRE", key, TTL]);

  try {
    await pipeline(cmds);
  } catch (_) {}
  res.status(204).end();
}
