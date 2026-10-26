// Stamps are free, so each one is paid for by us (screenshots). This keeps that bounded:
// a few stamps per visitor per day, and a cap for the whole site per day.
// Env (optional): STAMP_IP_LIMIT (default 5 per visitor per day), STAMP_DAILY_LIMIT (default 300 for everyone).
// With Upstash Redis connected the counts are shared; without it they live per function instance,
// which slows abuse rather than stopping it, so connect Redis before sharing the site widely.
// A stamp that fails gives its slot back. The owner (a request carrying the ADMIN_KEY, sent by the
// homepage after /admin was unlocked in the same tab) is never limited.
import crypto from "node:crypto";
import { pipeline, redisReady } from "./_redis.js";

const num = (v, d) => Math.max(1, parseInt(v || "", 10) || d);
const perIp = () => num(process.env.STAMP_IP_LIMIT, 5);
const perDay = () => num(process.env.STAMP_DAILY_LIMIT, 300);

const local = new Map();

function visitor(req, day) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || String(req.headers["x-real-ip"] || "") || req.socket?.remoteAddress || "";
  const salt = process.env.ANALYTICS_SALT || process.env.RESULT_SECRET || process.env.ADMIN_KEY || "doa";
  return crypto.createHmac("sha256", salt).update(`${day}|${ip}`).digest("base64url").slice(0, 16);
}

function isOwner(req) {
  const key = process.env.ADMIN_KEY || "";
  const sent = String(req.headers["x-admin-key"] || "");
  if (key.length < 32 || !sent) return false;
  const a = crypto.createHash("sha256").update(sent).digest();
  const b = crypto.createHash("sha256").update(key).digest();
  return crypto.timingSafeEqual(a, b);
}

const nothing = async () => {};

// Counts one stamp. Resolves { ok: true, giveBack }, or { ok: false, error } with a message for the visitor.
// Call giveBack() when the stamp fails, so a page we couldn't stamp doesn't use up a try.
export async function takeStamp(req) {
  if (isOwner(req)) return { ok: true, giveBack: nothing };
  const day = new Date().toISOString().slice(0, 10);
  const ipKey = `rl:${day}:ip:${visitor(req, day)}`;
  const allKey = `rl:${day}:all`;
  let mine, all, shared = false;
  if (redisReady()) {
    try {
      [mine, all] = await pipeline([["INCR", ipKey], ["INCR", allKey], ["EXPIRE", ipKey, 172800], ["EXPIRE", allKey, 172800]]);
      shared = mine != null;
    } catch (_) {}
  }
  if (mine == null) {
    if (local.size > 5000) local.clear();
    mine = (local.get(ipKey) || 0) + 1;
    all = (local.get(allKey) || 0) + 1;
    local.set(ipKey, mine);
    local.set(allKey, all);
  }
  const giveBack = async () => {
    if (shared) {
      await pipeline([["DECR", ipKey], ["DECR", allKey]]).catch(() => {});
    } else {
      local.set(ipKey, Math.max(0, (local.get(ipKey) || 1) - 1));
      local.set(allKey, Math.max(0, (local.get(allKey) || 1) - 1));
    }
  };
  if (Number(all) > perDay()) {
    await giveBack();
    return { ok: false, error: "We've stamped all we can for today. Come back tomorrow." };
  }
  if (Number(mine) > perIp()) {
    await giveBack();
    return { ok: false, error: `That's ${perIp()} stamps for you today. Fix something and come back tomorrow.` };
  }
  return { ok: true, giveBack };
}
