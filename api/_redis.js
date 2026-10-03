// Minimal Upstash Redis client over its REST API (no SDK). Connect Upstash from the Vercel
// Marketplace; it sets KV_REST_API_URL and KV_REST_API_TOKEN (or the UPSTASH_REDIS_REST_* pair).

// Vercel lets you pick a prefix when connecting Upstash (KV_, STORAGE_, ...), so match on the ending.
// The read-only token is skipped: counting needs to write.
function pick(endings) {
  for (const end of endings) {
    const key = Object.keys(process.env).find((k) => k.endsWith(end) && !k.includes("READ_ONLY") && process.env[k]);
    if (key) return process.env[key];
  }
  return "";
}

function config() {
  const url = pick(["KV_REST_API_URL", "REDIS_REST_URL"]);
  const token = pick(["KV_REST_API_TOKEN", "REDIS_REST_TOKEN"]);
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
