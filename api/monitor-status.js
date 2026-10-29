// Public, opt-in only. A Stay Alive owner turns public status on in the dashboard; this
// page then shows uptime, speed, and the latest stamp for that site, and nothing else:
// no owner email, no stack, no change details. Off by default, and a site that never
// opted in answers 404, so monitored sites cannot be enumerated by guessing.
// GET /status/<site id> (rewrite in vercel.json) or ?id=<site id>&format=json.
// The badge lives here too (?badge=1), so this stays one function: Vercel Hobby allows 12.
import { findPublicMonitor, monthlyHistory, reportSummary } from "./_monitor.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const id = String(req.query.id || "");
  if (!/^[A-Za-z0-9_-]{12}$/.test(id)) return res.status(404).json({ error: "No public status page here." });
  const m = await findPublicMonitor(id).catch(() => null);
  if (String(req.query.badge || "") === "1") {
    const s2 = m ? reportSummary(m) : null;
    const label = s2 ? (s2.currentUp ? "Up" : "Down") : "Status";
    const detail = s2?.uptime != null ? `${s2.uptime}% uptime` : "StampMyPage";
    const color = s2 ? (s2.currentUp ? "#15803d" : "#b91c1c") : "#666";
    const w = 14 + label.length * 7 + 14 + detail.length * 6.5;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w)}" height="28" role="img" aria-label="${esc(label)} · ${esc(detail)}"><rect width="100%" height="28" rx="14" fill="#111827"/><circle cx="16" cy="14" r="5" fill="${color}"/><text x="28" y="18" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="#fff">${esc(label)}</text><text x="${30 + label.length * 7}" y="18" font-family="system-ui,sans-serif" font-size="12" fill="#d1d5db">${esc(detail)}</text></svg>`;
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).send(svg);
  }
  if (!m) return res.status(404).json({ error: "No public status page here." });
  const s = reportSummary(m);
  const months = monthlyHistory(m.checks || []);
  const last30 = (m.checks || []).slice(-30);
  if (String(req.query.format || "") === "json") {
    return res.status(200).json({ host: s.host, url: s.url, up: s.currentUp, uptime30: s.uptime, avgMs: s.avgMs, lastCheckAt: s.lastCheckAt, verdict: s.verdictTo, score: s.scoreTo, latestStampId: s.latestStampId, months });
  }
  const dots = last30.map((c) => `<span class="dot ${c.ok ? "up" : "down"}" title="${esc(new Date(c.at).toDateString())}: ${c.ok ? `${c.ms} ms` : "down"}"></span>`).join("");
  const monthRows = months.map((mo) => `<tr><td>${esc(mo.month)}</td><td>${mo.checks}</td><td>${mo.uptime != null ? `${mo.uptime}%` : "—"}</td><td>${mo.avgMs != null ? `${mo.avgMs} ms` : "—"}</td></tr>`).join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(s.host)} status · StampMyPage</title><link rel="stylesheet" href="/status.css"></head><body>
<header class="bar"><img src="/brand/smp-mark.svg" alt="" width="26" height="26"><span>StampMyPage</span><em>Status</em></header>
<main><section class="card">
<p class="eyebrow">Status, monitored by Stay Alive</p>
<h1>${esc(s.host)}</h1>
<p><span class="pill ${s.currentUp ? "up" : s.currentUp === false ? "down" : "checking"}">${s.currentUp == null ? "Checking…" : s.currentUp ? "● Up" : "● Down"}</span></p>
<div class="grid">
<div class="kpi"><b>${s.uptime != null ? `${s.uptime}%` : "—"}</b><span>Uptime, last 30 days</span></div>
<div class="kpi"><b>${s.avgMs != null ? `${s.avgMs} ms` : "—"}</b><span>Average answer</span></div>
<div class="kpi"><b>${s.verdictTo ? `${s.verdictTo} ${s.scoreTo != null ? `${s.scoreTo}/100` : ""}` : "—"}</b><span>Latest stamp</span></div>
</div>
<p class="muted">Last check: ${s.lastCheckAt ? esc(new Date(s.lastCheckAt).toLocaleString()) : "not yet"}</p>
<h2>Last 30 checks</h2><div class="dots">${dots || "<span class='muted'>No checks yet.</span>"}</div>
<h2>By month</h2><table><tr><th>Month</th><th>Checks</th><th>Uptime</th><th>Avg answer</th></tr>${monthRows || "<tr><td colspan='4'>No checks yet.</td></tr>"}</table>
${s.latestStampId ? `<a class="btn" href="/v/${esc(s.latestStampId)}">See the latest stamp</a>` : ""}
</section></main><footer>Monitored by <a href="/">StampMyPage</a> · Stay Alive</footer></body></html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
}
