// A small key-value store for accounts, sessions, memberships, and reviews. Upstash Redis when it's
// connected; otherwise Vercel Blob, under paths hashed with the server secret so nobody can guess one.
// Values are JSON. ttl is in seconds. Anything secret stored here (test logins) is encrypted first.
import crypto from "node:crypto";
import { del, head, list, put } from "@vercel/blob";
import { pipeline, redisReady } from "./_redis.js";

const SECRET = () => process.env.RESULT_SECRET || process.env.ADMIN_KEY || "";
export const storeReady = () => redisReady() || (!!process.env.BLOB_READ_WRITE_TOKEN && SECRET().length >= 16);

// "user:a@b.com" -> "kv/user/<hash>.json". The namespace stays readable so one kind can be listed.
function blobPath(key) {
  const ns = key.split(":")[0].replace(/[^a-z0-9_-]/gi, "") || "x";
  const h = crypto.createHmac("sha256", SECRET()).update(key).digest("base64url").slice(0, 32);
  return `kv/${ns}/${h}.json`;
}

export async function get(key) {
  if (redisReady()) {
    const [v] = await pipeline([["GET", key]]);
    return v == null ? null : JSON.parse(v);
  }
  try {
    const meta = await head(blobPath(key));
    // The query string skips the CDN's copy, so a value read right after a write is the new one.
    const r = await fetch(`${meta.url}?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const box = await r.json();
    if (box.exp && box.exp < Date.now()) {
      await del(meta.url).catch(() => {});
      return null;
    }
    return box.value ?? null;
  } catch (_) {
    return null;
  }
}

export async function set(key, value, ttl = 0) {
  if (redisReady()) {
    await pipeline([ttl ? ["SET", key, JSON.stringify(value), "EX", ttl] : ["SET", key, JSON.stringify(value)]]);
    return;
  }
  const box = { value, exp: ttl ? Date.now() + ttl * 1000 : 0 };
  await put(blobPath(key), JSON.stringify(box), { access: "public", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60, contentType: "application/json" });
}

export async function remove(key) {
  if (redisReady()) {
    await pipeline([["DEL", key]]);
    return;
  }
  try {
    const meta = await head(blobPath(key));
    await del(meta.url);
  } catch (_) {}
}

// Read, change, write. Fine for one person's own record; not a lock.
export async function update(key, fn, ttl = 0) {
  const next = await fn(await get(key));
  if (next !== undefined) await set(key, next, ttl);
  return next;
}

// A small set of strings kept as one value (members to monitor, reviews to work on).
export async function addTo(key, item) {
  await update(key, (cur) => (Array.isArray(cur) && cur.includes(item) ? undefined : [...(Array.isArray(cur) ? cur : []), item]));
}
export async function members(key) {
  const v = await get(key);
  return Array.isArray(v) ? v : [];
}

// For the desk: every value in a namespace, when Blob is the store. Redis lists by its own index keys instead.
export async function listBlobNamespace(ns) {
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix: `kv/${ns}/`, cursor, limit: 1000 });
    out.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

// Encryption for test logins: AES-256-GCM with a key derived from the server secret.
function cryptKey() {
  const base = process.env.REVIEW_SECRET || SECRET();
  if (base.length < 16) throw new Error("No server secret to encrypt with.");
  return crypto.createHash("sha256").update(`review-credentials|${base}`).digest();
}
export function seal(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", cryptKey(), iv);
  const body = Buffer.concat([c.update(String(text), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}
export function unseal(sealed) {
  const [iv, tag, body] = String(sealed).split(".").map((s) => Buffer.from(s, "base64url"));
  const d = crypto.createDecipheriv("aes-256-gcm", cryptKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf8");
}
