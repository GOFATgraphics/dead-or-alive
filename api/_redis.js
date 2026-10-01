// Minimal Upstash Redis client over its REST API (no SDK). Connect Upstash from the Vercel
// Marketplace; it sets KV_REST_API_URL and KV_REST_API_TOKEN (or the UPSTASH_REDIS_REST_* pair).

function config() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export const redisReady = () => !!config();

// Runs commands in one round trip. Returns their results in order.
export async function pipeline(commands) {
  const c = config();
  if (!c) throw new Error("Redis is not connected.");
  if (!commands.length) return [];
  const r = await fetch(`${c.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`Redis said ${r.status}.`);
  const out = await r.json();
  return out.map((x) => (x && "result" in x ? x.result : null));
}
