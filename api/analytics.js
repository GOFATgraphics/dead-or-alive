// Admin-only. Everything the Analytics tab shows, for the last 7, 30, or 90 days.
// Traffic comes from the anonymous counters in Redis; sales and subscriptions from Polar; stamps from Blob.
// Each half works on its own: whatever isn't connected yet comes back as null with a note.
import { list } from "@vercel/blob";
import { fetchPolarOrders, polarReady, requireAdmin } from "./_lib.js";
import { CHECKOUT } from "./_plans.js";
import { pipeline, redisReady } from "./_redis.js";

const COUNTERS = [
  "view", "view:home", "view:result", "view:privacy", "view:terms",
  "form_start", "submit_try", "submit_error", "stamp_start", "queue_closed", "cta_click", "offer_click",
  "share_copy", "result_cta",
  "view:pricing", "view:dashboard", "save_click", "signup", "login", "checkout_start", "review_submit",
  "view:v:DEAD", "view:v:COPE", "view:v:ALIVE",
  "share_copy:v:DEAD", "share_copy:v:COPE", "share_copy:v:ALIVE",
];
const ZSETS = ["ref:home", "ref:result", "country", "device", "err"];

const isoDay = (d) => d.toISOString().slice(0, 10);
function lastDays(n) {
  const out = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) out.push(isoDay(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i))));
  return out;
}
const sum = (rows, key) => rows.reduce((a, r) => a + (r[key] || 0), 0);
const top = (map, n = 10) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));

async function traffic(days) {
  const cmds = [];
  for (const d of days) {
    cmds.push(["MGET", ...COUNTERS.map((c) => `a:${d}:e:${c}`)]);
    cmds.push(["PFCOUNT", `a:${d}:uv`]);
    cmds.push(["PFCOUNT", `a:${d}:uv:home`]);
    for (const z of ZSETS) cmds.push(["ZRANGE", `a:${d}:${z}`, 0, -1, "WITHSCORES"]);
  }
  const out = await pipeline(cmds);
  const per = 3 + ZSETS.length;
  const zsum = Object.fromEntries(ZSETS.map((z) => [z, new Map()]));
  const daily = days.map((d, i) => {
    const [counts, uv, uvHome, ...zs] = out.slice(i * per, (i + 1) * per);
    const row = { day: d, visitors: Number(uv) || 0, homeVisitors: Number(uvHome) || 0 };
    COUNTERS.forEach((c, j) => (row[c] = Number(counts?.[j]) || 0));
    zs.forEach((flat, j) => {
      const m = zsum[ZSETS[j]];
      for (let k = 0; flat && k < flat.length; k += 2) m.set(flat[k], (m.get(flat[k]) || 0) + Number(flat[k + 1]));
    });
    return row;
  });
  const totals = { visitors: sum(daily, "visitors"), homeVisitors: sum(daily, "homeVisitors") };
  for (const c of COUNTERS) totals[c] = sum(daily, c);
  return {
    daily: daily.map((r) => ({ day: r.day, visitors: r.visitors, views: r.view, formStarts: r.form_start, checkouts: r.stamp_start })),
    totals,
    verdictViews: { DEAD: totals["view:v:DEAD"], COPE: totals["view:v:COPE"], ALIVE: totals["view:v:ALIVE"] },
    verdictShares: { DEAD: totals["share_copy:v:DEAD"], COPE: totals["share_copy:v:COPE"], ALIVE: totals["share_copy:v:ALIVE"] },
    referrers: top(zsum["ref:home"]),
    resultReferrers: top(zsum["ref:result"]),
    countries: top(zsum.country),
    devices: top(zsum.device, 3),
    errors: top(zsum.err),
  };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]).catch(() => null);
      }
    })
  );
  return out;
}

// Which plan a Polar product is. Anything else in the same Polar organization is left out.
const PRODUCTS = {
  [CHECKOUT.killSheet.productId]: "killSheet",
  [CHECKOUT.stayAlive.productId]: "stayAlive",
  ...(CHECKOUT.stayAlive.yearly ? { [CHECKOUT.stayAlive.yearly.productId]: "stayAlive" } : {}),
};
const planOf = (o) => PRODUCTS[o.product_id || o.product?.id] || "";

// Active Stay Alive subscriptions, for monthly recurring revenue: what each actually pays (discounts and extra
// sites included), a yearly plan counted as a twelfth.
async function subscriptions() {
  const base = (process.env.POLAR_API_BASE || "https://api.polar.sh").replace(/\/$/, "");
  const r = await fetch(`${base}/v1/subscriptions/?active=true&limit=100`, { headers: { Authorization: `Bearer ${process.env.POLAR_ACCESS_TOKEN}`, Accept: "application/json" } });
  if (!r.ok) throw new Error(`Polar said ${r.status}.`);
  return ((await r.json()).items || []).filter((s) => planOf(s) === "stayAlive");
}

// Stamps published in the range, newest first: blob listing gives the dates, the JSON gives the verdict.
async function stampsSince(from) {
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix: "verdicts/", limit: 1000, cursor });
    for (const b of page.blobs) if (/^verdicts\/[A-Za-z0-9_-]+\.json$/.test(b.pathname) && new Date(b.uploadedAt) >= from) out.push(b);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out.sort((a, z) => new Date(z.uploadedAt) - new Date(a.uploadedAt));
}

async function business(days, notes) {
  const from = new Date(days[0] + "T00:00:00Z");
  const [orders, subs] = await Promise.all([fetchPolarOrders({ since: from }), subscriptions().catch((e) => (notes.push(`Subscriptions failed: ${e.message}`), []))]);
  const inRange = orders.filter((o) => planOf(o) && new Date(o.created_at) >= from);

  const byDay = new Map(days.map((d) => [d, { day: d, orders: 0, revenue: 0 }]));
  let revenue = 0, refunds = 0, refunded = 0, paid = 0, killSheets = 0, stayAlivePayments = 0;
  const currency = (inRange[0]?.currency || "usd").toUpperCase();
  for (const o of inRange) {
    const amount = Number(o.total_amount ?? o.amount ?? 0);
    const row = byDay.get(o.created_at.slice(0, 10));
    if (o.status === "refunded") {
      refunds++;
      refunded += Number(o.refunded_amount ?? amount);
      continue;
    }
    if (o.status !== "paid" && o.status !== "partially_refunded") continue;
    paid++;
    if (planOf(o) === "killSheet") killSheets++;
    else stayAlivePayments++;
    const net = amount - Number(o.refunded_amount || 0);
    revenue += net;
    if (row) {
      row.orders++;
      row.revenue += net;
    }
  }

  const mrr = Math.round(subs.reduce((a, s) => a + Number(s.amount || 0) / (s.recurring_interval === "year" ? 12 : 1), 0));

  // Verdicts from the newest 300 stamps in the range; the count covers them all.
  const verdicts = { DEAD: 0, COPE: 0, ALIVE: 0 };
  let stamped = 0;
  try {
    const blobs = await stampsSince(from);
    stamped = blobs.length;
    const records = await mapLimit(blobs.slice(0, 300), 16, async (b) => (await fetch(b.url, { cache: "no-store" })).json());
    for (const r of records) if (r && r.verdict in verdicts) verdicts[r.verdict]++;
  } catch (_) {
    notes.push("Stamp storage isn't connected, so stamps and verdicts can't be counted.");
  }

  return {
    currency,
    daily: [...byDay.values()],
    totals: { orders: paid, revenue, refunds, refunded, averageOrder: paid ? Math.round(revenue / paid) : 0, killSheets, stayAlivePayments, stamped },
    members: { stayAlive: subs.length, yearly: subs.filter((s) => s.recurring_interval === "year").length, extraSites: subs.reduce((a, s) => a + Math.max(0, (s.seats || 1) - 1), 0), mrr },
    verdicts,
  };
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  const n = [7, 30, 90].includes(Number(req.query?.days)) ? Number(req.query.days) : 30;
  const days = lastDays(n);
  const notes = [];

  const [t, b] = await Promise.all([
    redisReady()
      ? traffic(days).catch((e) => (notes.push(`Visitor counts failed: ${e.message}`), null))
      : (notes.push("Visitor counting is off. Connect Upstash Redis in Vercel to start. See the Setup tab."), null),
    polarReady()
      ? business(days, notes).catch((e) => (notes.push(`Orders failed: ${e.message}`), null))
      : (notes.push("Polar isn't connected, so orders and revenue are empty. See the Setup tab."), null),
  ]);

  res.status(200).json({ range: { days: n, from: days[0], to: days[days.length - 1] }, traffic: t, business: b, notes });
}
