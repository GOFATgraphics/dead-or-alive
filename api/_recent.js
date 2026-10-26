// The latest ALIVE and COPE stamps for the homepage's "Latest stamps" card: domain, icon, verdict, and score only.
// Served by /api/status?recent=1 (Vercel's Hobby plan allows 12 functions, so this one rides along).
// DEAD stamps are never listed, and no private result link leaves the server.
// Reads the Redis list _publish.js keeps; without Redis, reads the newest published records from Blob.
import { list } from "@vercel/blob";
import { pipeline, redisReady } from "./_redis.js";

const SHOW = 3;

async function fromRedis() {
  const [rows] = await pipeline([["LRANGE", "recent", 0, 49]]);
  return (rows || []).map((x) => {
    try {
      return JSON.parse(x);
    } catch (_) {
      return null;
    }
  }).filter(Boolean);
}

async function fromBlob() {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix: "verdicts/", cursor, limit: 1000 });
    blobs.push(...page.blobs.filter((b) => /^verdicts\/[A-Za-z0-9_-]+\.json$/.test(b.pathname)));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const recs = await Promise.all(
    blobs.slice(0, 30).map((b) => fetch(b.url).then((r) => (r.ok ? r.json() : null)).catch(() => null))
  );
  return recs.filter(Boolean).map((r) => ({ id: r.id, host: r.host, verdict: r.verdict, score: r.score ?? null, icon: r.icon || "", at: r.createdAt }));
}

// Only icons we stored ourselves go to the page.
const safeIcon = (u) => (/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/icons\//i.test(String(u || "")) ? u : "");

// Newest first, ALIVE always on the card when there is one: up to two ALIVE and one COPE, then whatever is newer.
function pick(items) {
  const seen = new Set();
  const fresh = items.filter((s) => ["ALIVE", "COPE"].includes(s.verdict) && s.host && !seen.has(s.host) && seen.add(s.host));
  const alive = fresh.filter((s) => s.verdict === "ALIVE");
  const cope = fresh.filter((s) => s.verdict === "COPE");
  const chosen = [...alive.slice(0, 2), ...cope.slice(0, 1)];
  for (const s of fresh) if (chosen.length < SHOW && !chosen.includes(s)) chosen.push(s);
  return chosen
    .slice(0, SHOW)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .map(({ host, verdict, score, icon, at }) => ({ host, verdict, score, icon: safeIcon(icon), at }));
}

export async function recentStamps(req, res) {
  let items = [];
  try {
    items = redisReady() ? await fromRedis() : [];
    if (!items.length && process.env.BLOB_READ_WRITE_TOKEN) items = await fromBlob();
  } catch (err) {
    console.error("Recent stamps failed:", err.message);
  }
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  res.status(200).json({ stamps: pick(items) });
}
