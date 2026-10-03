// Admin-only. Everything the Analytics tab shows, for the last 7, 30, or 90 days.
// Traffic comes from the anonymous counters in Redis; orders, revenue, and stamps from Polar and Blob.
// Each half works on its own: whatever isn't connected yet comes back as null with a note.
import { fetchPolarOrders, isVerdictOrder, isWaiting, polarReady, publishedStamps, requireAdmin, resultId } from "./_lib.js";
import { pipeline, redisReady } from "./_redis.js";

const COUNTERS = [
  "view", "view:home", "view:result", "view:paid", "view:privacy", "view:terms",
  "form_start", "submit_try", "submit_error", "checkout", "queue_closed", "cta_click",
  "share_copy", "result_cta",
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
    daily: daily.map((r) => ({ day: r.day, visitors: r.visitors, views: r.view, formStarts: r.form_start, checkouts: r.checkout })),
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

async function business(days, notes) {
  const from = new Date(days[0] + "T00:00:00Z");
  const all = await fetchPolarOrders({ since: from });
  const inRange = all.filter((o) => new Date(o.created_at) >= from && isVerdictOrder(o));

  let stamps = new Map();
  try {
    stamps = await publishedStamps();
  } catch (_) {
    notes.push("Vercel Blob isn't connected, so verdicts and turnaround can't be counted yet.");
  }

  const byDay = new Map(days.map((d) => [d, { day: d, orders: 0, revenue: 0 }]));
  let revenue = 0, refunds = 0, refunded = 0, paid = 0;
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
    const net = amount - Number(o.refunded_amount || 0);
    revenue += net;
    if (row) {
      row.orders++;
      row.revenue += net;
    }
  }

  // Match each paid order to its published stamp for verdicts and turnaround.
  const matched = inRange.filter((o) => o.status !== "refunded" && stamps.has(resultId(o.id)));
  const records = await mapLimit(matched, 16, async (o) => {
    const r = await fetch(stamps.get(resultId(o.id)), { cache: "no-store" });
    return r.ok ? { order: o, stamp: await r.json() } : null;
  });
  const verdicts = { DEAD: 0, COPE: 0, ALIVE: 0 };
  const hours = [];
  for (const rec of records) {
    if (!rec) continue;
    if (rec.stamp.verdict in verdicts) verdicts[rec.stamp.verdict]++;
    const h = (new Date(rec.stamp.createdAt) - new Date(rec.order.created_at)) / 3.6e6;
    if (Number.isFinite(h) && h >= 0) hours.push(h);
  }
  hours.sort((a, b) => a - b);
  const pct = (p) => (hours.length ? hours[Math.min(hours.length - 1, Math.floor(p * hours.length))] : null);

  return {
    currency,
    daily: [...byDay.values()],
    totals: {
      orders: paid,
      revenue,
      refunds,
      refunded,
      averageOrder: paid ? Math.round(revenue / paid) : 0,
      stamped: records.filter(Boolean).length,
      waitingNow: all.filter((o) => isWaiting(o, stamps)).length,
    },
    verdicts,
    turnaround: {
      count: hours.length,
      medianHours: pct(0.5),
      p90Hours: pct(0.9),
      within24h: hours.length ? hours.filter((h) => h <= 24).length / hours.length : null,
    },
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
