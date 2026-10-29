// Public, opt-in only. A Stay Alive owner turns public status on in the dashboard; this
// page then shows uptime, speed, and the latest stamp for that site, and nothing else:
// no owner email, no stack, no change details. Off by default, and a site that never
// opted in answers 404, so monitored sites cannot be enumerated by guessing.
// GET /status/<site id> (rewrite in vercel.json) or ?id=<site id>&format=json.
// The badge (?badge=1), the client report (?report=<signed token>, /report/<token>) and the read-only Kill Sheet
// (?sheet=<signed token>, /sheet/<token>) live here too, so this stays
// one function: Vercel Hobby allows 12.
import { downMinutes, findPublicMonitor, findReport, incidentList, monthlyHistory, reportSummary, uptimeOver } from "./_monitor.js";
import { findSheet } from "./_scout.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const mins = (n) => (n < 1 ? "None" : n < 60 ? `${Math.round(n)} min` : `${Math.floor(n / 60)} h ${Math.round(n % 60)} min`);
const day = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const stamp = (iso) => `${day(iso)}, ${new Date(iso).toISOString().slice(11, 16)} UTC`;
const page = (title, body, extra = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/status.css">${extra}</head><body>${body}</body></html>`;

// The badge: live state and 30-day uptime, then the brand, so every badge on a member's site points back here.
export function badge(m) {
  const s = m ? reportSummary(m) : null;
  const label = s ? (s.currentUp ? "Up" : "Down") : "Status";
  const detail = s?.uptime != null ? `${s.uptime}% uptime` : "monitored";
  const color = s ? (s.currentUp ? "#22c55e" : "#ef4444") : "#9ca3af";
  const brand = "Stamp My Page";
  const a = 33 + label.length * 7.6;
  const b = a + 6 + detail.length * 6.5;
  const w = Math.round(b + 14 + brand.length * 6.4 + 14);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="28" viewBox="0 0 ${w} 28" role="img" aria-label="${esc(label)}, ${esc(detail)}, monitored by ${brand}">
<title>${esc(label)}, ${esc(detail)}, monitored by ${brand}</title>
<clipPath id="r"><rect width="${w}" height="28" rx="14"/></clipPath>
<g clip-path="url(#r)"><rect width="${w}" height="28" fill="#12132a"/><rect x="${Math.round(b + 4)}" width="${w}" height="28" fill="#e5484d"/></g>
<circle cx="15" cy="14" r="5" fill="${color}"/>
<g font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="12">
<text x="26" y="18" font-weight="700" fill="#fff">${esc(label)}</text>
<text x="${Math.round(a)}" y="18" fill="#c9c8d6">${esc(detail)}</text>
<text x="${Math.round(b + 16)}" y="18" font-weight="700" fill="#fff">${brand}</text>
</g></svg>`;
}

export function statusPage(m) {
  const s = reportSummary(m);
  const months = monthlyHistory(m.checks || []);
  const recent = (m.checks || []).slice(-48);
  const dots = recent.map((c) => `<span class="dot ${c.ok ? "up" : "down"}" title="${esc(stamp(c.at))}: ${c.ok ? `${c.ms} ms` : "down"}"></span>`).join("");
  const monthRows = months.map((mo) => `<tr><td>${esc(mo.month)}</td><td>${mo.uptime != null ? `${mo.uptime}%` : "n/a"}</td><td>${mins(mo.downMinutes || 0)}</td><td>${mo.avgMs != null ? `${mo.avgMs} ms` : "n/a"}</td></tr>`).join("");
  return page(`${s.host} status · Stamp My Page`, `
<header class="bar"><img src="/brand/smp-mark.svg" alt="" width="26" height="26"><span>Stamp My Page</span><em>Status</em></header>
<main><section class="card">
<p class="eyebrow">Status, monitored by Stay Alive</p>
<h1>${esc(s.host)}</h1>
<p><span class="pill ${s.currentUp ? "up" : s.currentUp === false ? "down" : "checking"}">${s.currentUp == null ? "Checking…" : s.currentUp ? "● Up" : "● Down"}</span></p>
<div class="grid">
<div class="kpi"><b>${s.uptime != null ? `${s.uptime}%` : "n/a"}</b><span>Uptime, last 30 days</span></div>
<div class="kpi"><b>${s.avgMs != null ? `${s.avgMs} ms` : "n/a"}</b><span>Average answer</span></div>
<div class="kpi"><b>${s.verdictTo ? `${s.verdictTo} ${s.scoreTo != null ? `${s.scoreTo}/100` : ""}` : "n/a"}</b><span>Latest stamp</span></div>
</div>
<p class="muted">Checked every 5 minutes. Last check: ${s.lastCheckAt ? esc(stamp(s.lastCheckAt)) : "not yet"}.</p>
<h2>Recent history</h2><div class="dots">${dots || "<span class='muted'>No checks yet.</span>"}</div>
<h2>By month</h2><table><tr><th>Month</th><th>Uptime</th><th>Downtime</th><th>Avg answer</th></tr>${monthRows || "<tr><td colspan='4'>No checks yet.</td></tr>"}</table>
${s.latestStampId ? `<a class="btn" href="/v/${esc(s.latestStampId)}">See the latest stamp</a>` : ""}
</section></main><footer>Monitored by <a href="/">Stamp My Page</a> · Stay Alive</footer>`);
}

// The monthly client report. Everything is about the site; nothing about the account behind it.
export function reportPage(m, brand, token, monthWanted) {
  const checks = m.checks || [];
  const months = monthlyHistory(checks).map((x) => x.month);
  const now = new Date();
  const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const month = months.includes(monthWanted) ? monthWanted : months[0] || current;
  const [y, mo] = month.split("-").map(Number);
  const from = Date.UTC(y, mo - 1, 1);
  const to = Math.min(Date.now(), Date.UTC(y, mo, 1));
  const within = (iso) => { const t = Date.parse(iso); return t >= from && t < to; };
  const name = new Date(from).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const host = (() => { try { return new URL(m.url).hostname; } catch (_) { return m.url; } })();
  const up = checks.length ? uptimeOver(checks, from, to) : null;
  const down = downMinutes(checks, from, to);
  const ok = checks.filter((c) => c.ok && within(c.at));
  const avg = ok.length ? Math.round(ok.reduce((a, c) => a + (c.ms || 0), 0) / ok.length) : null;
  const incidents = incidentList(checks).filter((i) => within(i.start)).reverse();
  const restamps = (m.restamps || []).filter((r) => !r.failed && r.score != null && within(r.at));
  const lastStamp = restamps[restamps.length - 1] || [...(m.restamps || [])].reverse().find((r) => !r.failed && r.score != null && Date.parse(r.at) < to);
  const changes = (m.changes || []).filter((c) => within(c.at)).reverse();
  const nav = months.map((x) => (x === month ? `<b>${esc(x)}</b>` : `<a href="/report/${esc(token)}?month=${esc(x)}">${esc(x)}</a>`)).join("");
  const changeLines = (c) => [
    ...(c.drop ? [`Score dropped from ${c.drop.from} to ${c.drop.to}`] : []),
    ...(c.google || []).map((g) => g.text),
    ...(c.verdict ? [`Stamp went from ${c.verdict.from} to ${c.verdict.to}`] : []),
    ...(c.lcp ? [`Main content in ${(c.lcp.to / 1000).toFixed(1)}s, was ${(c.lcp.from / 1000).toFixed(1)}s`] : []),
    ...(c.added || []).map((t) => `Added: ${t}`),
    ...(c.removed || []).map((t) => `Removed: ${t}`),
  ];
  const certDays = m.cert?.validTo ? Math.floor((Date.parse(m.cert.validTo) - Date.now()) / 86400000) : null;
  const domDays = m.domain?.expires ? Math.floor((Date.parse(m.domain.expires) - Date.now()) / 86400000) : null;
  const health = [
    ["Security certificate", m.cert?.validTo ? `Valid until ${day(m.cert.validTo)} (${certDays} days)` : "Not checked yet"],
    ["Domain", m.domain?.shared ? `Shared address on ${m.domain.shared}, nothing to renew` : m.domain?.expires ? `Renews by ${day(m.domain.expires)} (${domDays} days)` : "Renewal date not published"],
    ["Google", !m.google || m.google.error ? "Not checked yet" : m.google.noindex ? "Hidden: the page has a noindex tag" : m.google.robotsBlocked ? "Hidden: robots.txt blocks it" : "Can list the page"],
    ["Links on the page", !m.links ? "Not checked yet" : m.links.broken.length ? `${m.links.broken.length} broken of ${m.links.checked}` : `All ${m.links.checked} work`],
    ...(m.keyPages || []).map((k) => [`Key page ${new URL(k.url).pathname}`, k.lastCheck ? (k.lastCheck.ok ? `Up, answers in ${k.lastCheck.ms} ms` : "Down") : "Not checked yet"]),
  ];
  return page(`${host} · ${name} report`, `
<header class="bar"><img src="/brand/smp-mark.svg" alt="" width="26" height="26"><span>Stamp My Page</span><em>Monthly report</em></header>
<main><section class="card report">
<p class="eyebrow">${brand ? `Prepared by ${esc(brand)}` : "Site report"} · ${esc(name)}</p>
<h1>${esc(host)}</h1>
<p class="muted">${esc(m.url)} · ${to < Date.UTC(y, mo, 1) ? `${day(new Date(from).toISOString())} to today` : `${day(new Date(from).toISOString())} to ${day(new Date(to - 1).toISOString())}`}</p>
${months.length > 1 ? `<nav class="months" aria-label="Other months">${nav}</nav>` : ""}
<div class="grid">
<div class="kpi"><b>${up != null ? `${up}%` : "n/a"}</b><span>Uptime</span></div>
<div class="kpi"><b>${mins(down)}</b><span>Downtime</span></div>
<div class="kpi"><b>${incidents.length}</b><span>Outage${incidents.length === 1 ? "" : "s"}</span></div>
<div class="kpi"><b>${avg != null ? `${avg} ms` : "n/a"}</b><span>Average answer</span></div>
<div class="kpi"><b>${lastStamp ? `${lastStamp.score}/100` : "n/a"}</b><span>Stamp score${lastStamp ? `, ${esc(lastStamp.verdict)}` : ""}</span></div>
<div class="kpi"><b>${changes.length}</b><span>Change${changes.length === 1 ? "" : "s"} spotted</span></div>
</div>
<p class="muted">Checked every 5 minutes; a failed check is confirmed with a second one 30 seconds later before it counts.</p>
<h2>Outages</h2>
${incidents.length ? `<table><tr><th>Started</th><th>Back</th><th>Length</th><th>Cause</th></tr>${incidents.map((i) => `<tr><td>${esc(stamp(i.start))}</td><td>${i.end ? esc(stamp(i.end)) : "Still down"}</td><td>${mins(((i.end ? Date.parse(i.end) : Date.now()) - Date.parse(i.start)) / 60000)}</td><td>${esc(i.why || "")}</td></tr>`).join("")}</table>` : `<p class="muted">None this month.</p>`}
<h2>Weekly stamps</h2>
${restamps.length ? `<table><tr><th>Date</th><th>Verdict</th><th>Score</th><th>Main content</th></tr>${restamps.map((r) => `<tr><td><a href="/v/${esc(r.id)}">${esc(day(r.at))}</a></td><td>${esc(r.verdict)}</td><td>${r.score}/100</td><td>${r.lcp ? `${(r.lcp / 1000).toFixed(1)}s` : "n/a"}</td></tr>`).join("")}</table>` : `<p class="muted">No re-stamp this month yet.</p>`}
<h2>Health today</h2>
<table>${health.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>
<h2>Changes spotted</h2>
${changes.length ? `<ul class="changes">${changes.map((c) => `<li><time>${esc(day(c.at))}</time><span>${changeLines(c).map(esc).join("<br>")}</span></li>`).join("")}</ul>` : `<p class="muted">Nothing changed this month.</p>`}
<p class="actions"><button type="button" class="btn" data-print>Print or save as PDF</button></p>
</section></main><footer>Monitored with <a href="/">Stamp My Page</a> · Stay Alive</footer><script src="/report.js"></script>`);
}

// The Kill Sheet, read-only, for whoever makes the fixes: the fixes in order with points and time, the checklist
// as the owner left it, and the rewrites. Nothing about the account.
export function sheetPage(r) {
  const host = (() => { try { return new URL(r.url).hostname; } catch (_) { return r.url; } })();
  const done = new Set(r.done || []);
  const rw = r.rewrites || {};
  const subheads = rw.subheads || (rw.subhead ? [{ angle: "Subhead", text: rw.subhead }] : []);
  const fixes = (r.fixes || []).map((f, i) => `<li class="${done.has(f.title) ? "done" : ""}"><div class="fx-top"><b>${done.has(f.title) ? "✓ " : ""}${i + 1}. ${esc(f.title)}</b><span>${f.points != null ? `+${f.points} points` : esc(f.impact)}${f.effort ? ` · about ${esc(f.effort)}` : ""}</span></div><p>${esc(f.problem)}</p><p><b>Fix:</b> ${esc(f.fix)}</p>${f.after ? `<p class="muted">Score after this one: ${f.after.score} (${esc(f.after.verdict)})</p>` : ""}</li>`).join("");
  return page(`${host} · Kill Sheet`, `
<header class="bar"><img src="/brand/smp-mark.svg" alt="" width="26" height="26"><span>Stamp My Page</span><em>Kill Sheet, read-only</em></header>
<main><section class="card report">
<p class="eyebrow">Fixes for ${esc(host)}</p>
<h1>${esc(host)}</h1>
<p class="muted">${esc(r.url)}${r.stamp ? ` · stamped ${esc(r.stamp.verdict)} ${r.stamp.score}/100` : ""} · ${done.size} of ${(r.fixes || []).length} fixes done</p>
${r.stamp?.image ? `<p><a href="/v/${esc(r.stamp.id)}"><img class="shot" src="${esc(r.stamp.image)}" alt="The stamp, with the problems circled"></a></p>` : ""}
<h2>Fixes, in order</h2>
<ol class="fixlist">${fixes}</ol>
<h2>Copy to use</h2>
<table>
<tr><th scope="row">Headline now</th><td>${esc(rw.before?.headline || "No headline found")}</td></tr>
${(rw.headlines || []).map((h, i) => `<tr><th scope="row">Headline ${i + 1}${rw.angles?.[i] ? `<br><small>${esc(rw.angles[i])}</small>` : ""}</th><td>${esc(h)}</td></tr>`).join("")}
${subheads.map((s) => `<tr><th scope="row">Subhead<br><small>${esc(s.angle)}</small></th><td>${esc(s.text)}</td></tr>`).join("")}
${rw.button ? `<tr><th scope="row">Main button</th><td>${esc(rw.button)}</td></tr>` : ""}
</table>
<p class="muted">Words in [brackets] are for the owner to fill in.</p>
${r.fullShot ? `<p><a class="btn" href="${esc(r.fullShot)}">Full-page screenshot</a></p>` : ""}
<p class="actions"><button type="button" class="btn" data-print>Print or save as PDF</button></p>
</section></main><footer>Made with <a href="/">Stamp My Page</a></footer><script src="/report.js"></script>`);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  if (req.query.sheet) {
    const r = await findSheet(String(req.query.sheet)).catch(() => null);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (!r) return res.status(404).send(page("Kill Sheet not found", `<main><section class="card"><h1>No Kill Sheet here</h1><p class="muted">This link isn't valid any more. Ask whoever sent it for a new one.</p></section></main>`));
    return res.status(200).send(sheetPage(r));
  }
  if (req.query.report) {
    const found = await findReport(String(req.query.report)).catch(() => null);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (!found) return res.status(404).send(page("Report not found", `<main><section class="card"><h1>No report here</h1><p class="muted">This report link isn't valid any more. Ask whoever sent it for a new one.</p></section></main>`));
    return res.status(200).send(reportPage(found.m, found.brand, String(req.query.report), String(req.query.month || "")));
  }
  const id = String(req.query.id || "");
  if (!/^[A-Za-z0-9_-]{12}$/.test(id)) return res.status(404).json({ error: "No public status page here." });
  const m = await findPublicMonitor(id).catch(() => null);
  if (String(req.query.badge || "") === "1") {
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).send(badge(m));
  }
  if (!m) return res.status(404).json({ error: "No public status page here." });
  if (String(req.query.format || "") === "json") {
    const s = reportSummary(m);
    return res.status(200).json({ host: s.host, url: s.url, up: s.currentUp, uptime30: s.uptime, avgMs: s.avgMs, lastCheckAt: s.lastCheckAt, verdict: s.verdictTo, score: s.scoreTo, latestStampId: s.latestStampId, months: monthlyHistory(m.checks || []) });
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(statusPage(m));
}
