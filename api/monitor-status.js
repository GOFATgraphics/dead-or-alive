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
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(s.host)} status · StampMyPage</title><style>
body{font:400 1rem/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#171717;background:#f7f7f5;margin:0;padding:2rem 1rem}
main{max-width:40rem;margin:0 auto;background:#fff;border:1px solid #e5e5e0;border-radius:16px;padding:1.5rem 1.75rem}
h1{font-size:1.5rem;letter-spacing:-.02em;margin:.25rem 0}.muted{color:#666;font-size:.9rem}
.big{font-size:1.125rem;font-weight:700}.up{color:#15803d}.down{color:#b91c1c}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin:1.25rem 0}.grid b{font-size:1.25rem;display:block}
.dots{display:flex;flex-wrap:wrap;gap:4px;margin:.5rem 0}.dots .dot{width:12px;height:12px;border-radius:3px;background:#ddd}.dots .dot.up{background:#22c55e}.dots .dot.down{background:#ef4444}
table{width:100%;border-collapse:collapse;font-size:.9rem}td,th{text-align:left;padding:.4rem .5rem;border-bottom:1px solid #eee}
a{color:#171717;font-weight:600}footer{max-width:40rem;margin:1rem auto;text-align:center;color:#666;font-size:.85rem}
@media(max-width:520px){.grid{grid-template-columns:1fr}}
</style></head><body><main>
<p class="muted">Status, monitored by StampMyPage Stay Alive</p>
<h1>${esc(s.host)}</h1>
<p class="big ${s.currentUp ? "up" : "down"}">${s.currentUp == null ? "Checking…" : s.currentUp ? "● Up" : "● Down"}</p>
<div class="grid"><div><b>${s.uptime != null ? `${s.uptime}%` : "—"}</b><span class="muted">uptime, last 30 days</span></div><div><b>${s.avgMs != null ? `${s.avgMs} ms` : "—"}</b><span class="muted">average answer</span></div><div><b>${s.verdictTo ? `${s.verdictTo} ${s.scoreTo != null ? `${s.scoreTo}/100` : ""}` : "—"}</b><span class="muted">latest stamp</span></div></div>
<p class="muted">Last check: ${s.lastCheckAt ? esc(new Date(s.lastCheckAt).toLocaleString()) : "not yet"}</p>
<h2>Last 30 checks</h2><div class="dots">${dots || "<span class='muted'>No checks yet.</span>"}</div>
<h2>By month</h2><table><tr><th>Month</th><th>Checks</th><th>Uptime</th><th>Avg answer</th></tr>${monthRows || "<tr><td colspan='4'>No checks yet.</td></tr>"}</table>
${s.latestStampId ? `<p><a href="/v/${esc(s.latestStampId)}">See the latest stamp</a></p>` : ""}
</main><footer>Monitored by <a href="/">StampMyPage</a> · Stay Alive</footer></body></html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
}
