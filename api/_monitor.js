// Stay Alive: pages watched for their owner. Every day (Vercel cron) each is checked for uptime and speed; every
// week it's re-stamped. The first check and re-stamp run the moment the membership starts, or a site is added.
// The plan includes one site; each extra one is a paid seat on the subscription. Results live in
// monitor:<email>:<site id> and show in the dashboard. A page that goes down gets an email, when email is set up.
import crypto from "node:crypto";
import { get, remove, set, members } from "./_store.js";
import { getUser, hasStayAlive } from "./_account.js";
import { stampNow } from "./_stamp.js";
import { mail } from "./_publish.js";
import { brokenLinks, certificate, cleanPhrases, daysLeft, domainExpiry, googleDiff, missingWord, pageFacts, stepFor } from "./_watch.js";

// Every site on the account, in the order they were added (the first came with the plan).
export function sitesOf(u) {
  const sa = u?.stayAlive;
  if (!sa) return [];
  return [...new Set(sa.sites?.length ? sa.sites : sa.url ? [sa.url] : [])];
}
// How many sites are paid for: the plan's one, plus extra seats.
export const seatsOf = (u) => Math.max(1, parseInt(u?.stayAlive?.seats, 10) || 1);
// The sites actually watched. If the paid count drops below the list, the newest ones pause.
export const watchedSites = (u) => sitesOf(u).slice(0, seatsOf(u));

export const siteId = (url) => crypto.createHash("sha256").update(url).digest("base64url").slice(0, 12);
export const monitorKey = (email, url) => `monitor:${email}:${siteId(url)}`;
const WEEK = 6.5 * 86400000; // a little under a week, so a daily cron never skips one

// One uptime and speed check: did it answer, with what status, how fast. With must-have words set, a page that
// answers but no longer shows one of them counts as down.
export async function checkOnce(pageUrl, mustHave = []) {
  const t0 = Date.now();
  try {
    const r = await fetch(pageUrl, { redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "User-Agent": "Mozilla/5.0 (compatible; StampMyPage-Monitor/1.0; +https://stampmypage.com)" } });
    const firstByte = Date.now() - t0;
    const words = mustHave?.length > 0 && r.status < 400;
    const html = words ? await r.text().catch(() => "") : (await r.arrayBuffer().catch(() => null), "");
    const missing = words ? missingWord(html, mustHave) : "";
    if (missing) return { at: new Date().toISOString(), ok: false, status: r.status, ms: firstByte, totalMs: Date.now() - t0, missing, error: `"${missing}" is missing` };
    return { at: new Date().toISOString(), ok: r.status < 400, status: r.status, ms: firstByte, totalMs: Date.now() - t0 };
  } catch (err) {
    return { at: new Date().toISOString(), ok: false, status: 0, ms: Date.now() - t0, error: /timeout|abort/i.test(String(err?.name || err)) ? "No answer in 15s" : "Could not connect" };
  }
}

// --- Upgrade 4: alert control. Defaults preserve the old behaviour: down and change
// alerts on, no quiet hours, no webhook, not paused. A setting only ever silences the
// owner's own alerts; it never changes what is checked or recorded. ---
export function alertSettings(m = {}) {
  return {
    down: m.alerts?.down !== false,
    changes: m.alerts?.changes !== false,
    expiry: m.alerts?.expiry !== false,
    quietStart: Number.isInteger(m.alerts?.quietStart) ? m.alerts.quietStart : null,
    quietEnd: Number.isInteger(m.alerts?.quietEnd) ? m.alerts.quietEnd : null,
    webhook: m.webhookUrl || "",
  };
}
// Quiet hours are UTC hours, and they silence change alerts only, never down alerts:
// a down page at 3am is still urgent, a stack change can wait until morning.
export function inQuietHours(a, now = new Date()) {
  if (a.quietStart == null || a.quietEnd == null) return false;
  const h = now.getUTCHours();
  return a.quietStart < a.quietEnd ? h >= a.quietStart && h < a.quietEnd : h >= a.quietStart || h < a.quietEnd;
}
// Slack and Discord want their own shape (a message); anything else gets the JSON event with the message in it.
export function webhookKind(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "hooks.slack.com") return "slack";
    if (/^(ptb\.|canary\.)?(discord|discordapp)\.com$/.test(u.hostname) && u.pathname.startsWith("/api/webhooks/")) return "discord";
  } catch (_) {}
  return "json";
}
export async function postWebhook(url, payload, message = "") {
  if (!url) return { ok: false };
  const kind = webhookKind(url);
  const dash = "https://stampmypage.com/dashboard#monitoring";
  const body = kind === "slack" ? { text: `${message}\n<${dash}|Open your dashboard>` } : kind === "discord" ? { content: `${message}\n${dash}`, username: "Stamp My Page" } : { ...payload, message };
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "StampMyPage-Monitor/1.0" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
    return { ok: r.ok, status: r.status };
  } catch (_) {
    return { ok: false }; // A dead webhook must never break the email alert or the check.
  }
}
function validWebhook(raw) {
  if (!raw) return "";
  let u;
  try { u = new URL(raw); } catch (_) { throw new Error("Webhook must be a full https:// URL."); }
  if (u.protocol !== "https:" || u.username || u.password) throw new Error("Webhook must be a plain https:// URL, no login in it.");
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(u.hostname)) throw new Error("Webhook must be a public https:// URL, not a local address.");
  return u.toString();
}
function validHour(v) {
  if (v == null || v === "") return null;
  const n = parseInt(v, 10);
  if (!Number.isInteger(n) || n < 0 || n > 23) throw new Error("Quiet hours must be whole hours from 0 to 23.");
  return n;
}
export async function setAlertSettings(email, url, { down, changes, expiry, quietStart, quietEnd, webhook }) {
  const u = await getUser(email);
  const page = sitesOf(u).find((s) => s === url);
  if (!page || !hasStayAlive(u)) return null;
  const qs = validHour(quietStart), qe = validHour(quietEnd);
  if ((qs == null) !== (qe == null)) throw new Error("Set both quiet hours, or neither.");
  const m = (await get(monitorKey(email, page))) || { url: page, checks: [] };
  m.alerts = { down: down !== false, changes: changes !== false, expiry: expiry !== false, quietStart: qs, quietEnd: qe };
  m.webhookUrl = validWebhook(webhook);
  await set(monitorKey(email, page), m);
  return m;
}
export async function setPaused(email, url, paused) {
  const u = await getUser(email);
  const page = sitesOf(u).find((s) => s === url);
  if (!page || !hasStayAlive(u)) return null;
  const m = (await get(monitorKey(email, page))) || { url: page, checks: [] };
  m.pausedManual = !!paused;
  await set(monitorKey(email, page), m);
  return m;
}

// Checks one of a member's sites (the first, unless one is named), re-stamps it when a week has passed (or when
// forced), and saves the history.
export async function runMonitor(email, { restamp = false, url = "" } = {}) {
  const u = await getUser(email);
  const watched = watchedSites(u);
  const pageUrl = url ? watched.find((s) => s === url) : watched[0];
  if (!pageUrl || !hasStayAlive(u)) return null;
  const m = (await get(monitorKey(email, pageUrl))) || { url: pageUrl, checks: [], restamps: [] };
  if (m.pausedManual) return m;
  const check = await confirmedCheck(pageUrl, m.mustHave);
  const alert = record(m, check);
  const due = restamp || !m.lastRestampAt || Date.now() - new Date(m.lastRestampAt).getTime() > WEEK;
  if (due && check.ok) {
    m.restampRunning = true;
    await set(monitorKey(email, pageUrl), m);
    const r = await stampNow(pageUrl).catch((e) => ({ failed: e.message }));
    m.restampRunning = false;
    m.lastRestampAt = new Date().toISOString();
    m.restamps = [...m.restamps, r.failed ? { at: m.lastRestampAt, failed: String(r.failed).slice(0, 200) } : { at: m.lastRestampAt, id: r.id, verdict: r.verdict, score: r.score, lcp: r.snapshot?.browser?.lcp || null }].slice(-30);
    if (!r.failed) {
      const change = diff(m.lastSeen, seen(r));
      m.lastSeen = seen(r);
      if (change) {
        m.changes = [{ at: m.lastRestampAt, stampId: r.id, ...change }, ...(m.changes || [])].slice(0, 30);
        await alertChange(email, pageUrl, change, m);
      }
    }
  }
  await dailyExtras(email, pageUrl, m).catch((e) => console.error("Extra checks failed:", pageUrl, e));
  await set(monitorKey(email, pageUrl), m);
  await sendUptimeAlert(email, pageUrl, m, alert);
  return m;
}

// --- Frequent uptime: every few minutes (a scheduled GitHub Action calls /api/stamp?cron=pulse), each watched
// site gets a quick check. A failure is checked again 30 seconds later before it counts, so one blip never
// emails anyone. History keeps one check an hour plus every change between up and down, so it stays small and
// incidents keep their real start and end. ---
const HOUR = 3600000;
const KEEP = 1200; // about 50 days of hourly checks, plus up/down changes

// A failed check is tried once more 30 seconds later; the second answer counts.
export async function confirmedCheck(pageUrl, mustHave = []) {
  const first = await checkOnce(pageUrl, mustHave);
  if (first.ok) return first;
  await new Promise((r) => setTimeout(r, 30000));
  const again = await checkOnce(pageUrl, mustHave);
  return again.ok ? again : { ...again, confirmed: true };
}

// Adds a check to the history and says whether it changed the state: "down", "up" (with how long it was down),
// or "" when nothing changed.
export function record(m, check) {
  m.checks ||= [];
  const last = m.checks[m.checks.length - 1];
  const wasUp = last ? last.ok : true;
  const changed = !last || last.ok !== check.ok;
  if (changed || Date.parse(check.at) - Date.parse(last.at) >= HOUR) m.checks = [...m.checks, check].slice(-KEEP);
  m.lastCheckAt = check.at;
  m.lastCheck = check;
  if (wasUp && !check.ok) {
    m.downSince = check.at;
    return { kind: "down", check };
  }
  if (!wasUp && check.ok) {
    const since = m.downSince || last?.at;
    m.downSince = null;
    return { kind: "up", check, since, minutes: since ? Math.max(1, Math.round((Date.parse(check.at) - Date.parse(since)) / 60000)) : null };
  }
  return { kind: "" };
}

const fmtUtc = (iso) => new Date(iso).toISOString().slice(11, 16) + " UTC";
const span = (n) => (n == null ? "a while" : n < 60 ? `${n} minute${n === 1 ? "" : "s"}` : `${Math.floor(n / 60)} h ${n % 60} min`);

// The email and webhook for a change between up and down. Down alerts and recoveries ignore quiet hours:
// those only hold back change alerts.
export async function sendUptimeAlert(email, pageUrl, m, alert) {
  if (!alert?.kind || !alertSettings(m).down) return;
  const host = new URL(pageUrl).hostname;
  const c = alert.check;
  const dash = "https://stampmypage.com/dashboard#monitoring";
  if (alert.kind === "down") {
    const what = c.missing ? `answered, but "${c.missing}" is no longer on the page` : c.status ? `answered ${c.status}` : String(c.error || "did not answer").toLowerCase();
    await mail(email, {
      subject: `Down: ${host}`,
      text: `Stay Alive checked ${pageUrl} twice, 30 seconds apart, and it ${what}. Down since ${fmtUtc(c.at)}.\n\nWe keep checking every few minutes and email you the moment it's back.\n\n${dash}`,
      html: `<p>Stay Alive checked <a href="${pageUrl}">${pageUrl}</a> twice, 30 seconds apart, and it ${what}. Down since ${fmtUtc(c.at)}.</p><p>We keep checking every few minutes and email you the moment it's back.</p><p><a href="${dash}">See it in your dashboard</a></p>`,
    }).catch(() => {});
    await postWebhook(alertSettings(m).webhook, { event: "down", url: pageUrl, host, status: c.status, error: c.error || null, missing: c.missing || null, at: c.at }, `🔴 Down: ${host}. It ${what}. Down since ${fmtUtc(c.at)}.`);
  } else {
    await mail(email, {
      subject: `Back up: ${host}, after ${span(alert.minutes)}`,
      text: `${pageUrl} is answering again (${c.status}, ${c.ms} ms). It was down for ${span(alert.minutes)}${alert.since ? `, from ${fmtUtc(alert.since)} to ${fmtUtc(c.at)}` : ""}.\n\n${dash}`,
      html: `<p><a href="${pageUrl}">${pageUrl}</a> is answering again (${c.status}, ${c.ms} ms). It was down for ${span(alert.minutes)}${alert.since ? `, from ${fmtUtc(alert.since)} to ${fmtUtc(c.at)}` : ""}.</p><p><a href="${dash}">See it in your dashboard</a></p>`,
    }).catch(() => {});
    await postWebhook(alertSettings(m).webhook, { event: "up", url: pageUrl, host, status: c.status, downMinutes: alert.minutes, since: alert.since || null, at: c.at }, `🟢 Back up: ${host}, after ${span(alert.minutes)}.`);
  }
}

// One quick check of every watched site, no re-stamps. Ten at a time.
export async function pulseAll() {
  const emails = await members("idx:members");
  const jobs = [];
  for (const email of emails) {
    const u = await getUser(email).catch(() => null);
    if (hasStayAlive(u)) for (const url of watchedSites(u)) jobs.push([email, url]);
  }
  const out = { checked: 0, down: 0, up: 0 };
  for (let i = 0; i < jobs.length; i += 10) {
    await Promise.allSettled(
      jobs.slice(i, i + 10).map(async ([email, url]) => {
        const key = monitorKey(email, url);
        const before = await get(key);
        if (!before || before.pausedManual) return;
        const check = await confirmedCheck(url, before.mustHave);
        const m = (await get(key)) || before; // the daily run may have written meanwhile
        const alert = record(m, check);
        await set(key, m);
        await sendUptimeAlert(email, url, m, alert);
        out.checked++;
        if (alert.kind) out[alert.kind]++;
      })
    );
  }
  return out;
}

// What a re-stamp saw that's worth watching: every tool by category, main-content time, score, verdict.
function seen(r) {
  const stack = (r.snapshot?.stack || []).map((t) => `${t.category}: ${t.name}`);
  return { stack, lcp: r.snapshot?.browser?.lcp || null, score: r.score ?? null, verdict: r.verdict };
}

// What changed since the last re-stamp: tools added or removed (pixels and analytics included), speed that moved
// by more than a third, or a different verdict. Null when nothing did, or on the first re-stamp.
function diff(before, now) {
  if (!before) return null;
  const added = now.stack.filter((t) => !before.stack.includes(t));
  const removed = before.stack.filter((t) => !now.stack.includes(t));
  const lcp = before.lcp && now.lcp && Math.abs(now.lcp - before.lcp) / before.lcp > 0.33 ? { from: before.lcp, to: now.lcp } : null;
  const verdict = before.verdict !== now.verdict ? { from: before.verdict, to: now.verdict } : null;
  if (!added.length && !removed.length && !lcp && !verdict) return null;
  return { added, removed, lcp, verdict, pixels: [...added, ...removed].some((t) => /^(Ads & pixels|Analytics):/.test(t)) };
}

async function alertChange(email, pageUrl, c, m = {}) {
  const a = alertSettings(m);
  if (!a.changes || inQuietHours(a)) return;
  const host = new URL(pageUrl).hostname;
  const google = c.google || [];
  const lines = [
    ...google.map((g) => g.text),
    ...(c.added || []).map((t) => `Added: ${t}`),
    ...(c.removed || []).map((t) => `Removed: ${t}`),
    c.lcp ? `Main content now shows in ${(c.lcp.to / 1000).toFixed(1)}s (was ${(c.lcp.from / 1000).toFixed(1)}s)` : "",
    c.verdict ? `Stamp went from ${c.verdict.from} to ${c.verdict.to}` : "",
  ].filter(Boolean);
  const hidden = google.some((g) => g.tone === "bad" && /noindex|robots|another site/.test(g.text));
  const onlyGoogle = google.length && !c.added?.length && !c.removed?.length && !c.lcp && !c.verdict;
  const subject = hidden ? `${host}: Google may drop this page` : onlyGoogle ? `${host}: what Google sees changed` : `${host} changed: ${c.verdict ? `now ${c.verdict.to}` : c.pixels ? "tracking changed" : c.lcp ? "speed changed" : "stack changed"}`;
  const how = c.stampId ? "re-stamped" : "checked";
  await mail(email, {
    subject,
    text: `Stay Alive ${how} ${pageUrl} and noticed:\n\n${lines.join("\n")}\n\nDetails in your dashboard: https://stampmypage.com/dashboard#monitoring`,
    html: `<p>Stay Alive ${how} <a href="${pageUrl}">${pageUrl}</a> and noticed:</p><ul>${lines.map((l) => `<li>${l.replace(/[<>&]/g, "")}</li>`).join("")}</ul><p><a href="https://stampmypage.com/dashboard#monitoring">Details in your dashboard</a></p>`,
  }).catch(() => {});
  await postWebhook(a.webhook, { event: "change", url: pageUrl, host, at: new Date().toISOString(), added: c.added || [], removed: c.removed || [], lcp: c.lcp || null, verdict: c.verdict || null, google }, `🟡 ${subject}\n${lines.map((l) => `• ${l}`).join("\n")}`);
}

// --- The daily extras: security certificate and domain renewal dates, what Google is told, and once a week the
// links on the page. Warnings go out once per step (certificate: 14, 7, 1 days; domain: 30, 7, 1 days) and again
// when it runs out; a renewal starts the steps over. ---
const LINKS_EVERY = 6.5 * 86400000;
async function dailyExtras(email, pageUrl, m) {
  const host = new URL(pageUrl).hostname;
  const [cert, domain, facts] = await Promise.all([pageUrl.startsWith("https:") ? certificate(host) : null, domainExpiry(host), pageFacts(pageUrl)]);
  if (cert) m.cert = cert.error && m.cert?.validTo ? { ...m.cert, at: cert.at, error: cert.error } : cert;
  m.domain = domain.error && m.domain?.expires && m.domain.domain === domain.domain ? { ...m.domain, at: domain.at } : domain;
  await expiryAlerts(email, pageUrl, m);
  const { html, finalUrl, ...google } = facts;
  const lines = googleDiff(m.google, google);
  if (!google.error || !m.google) m.google = google;
  if (lines.length) {
    const change = { at: google.at, google: lines, added: [], removed: [], lcp: null, verdict: null, pixels: false };
    m.changes = [change, ...(m.changes || [])].slice(0, 30);
    await alertChange(email, pageUrl, change, m);
  }
  if (html && (!m.links || Date.now() - Date.parse(m.links.at) > LINKS_EVERY)) {
    const before = new Set((m.links?.broken || []).map((b) => b.url));
    m.links = await brokenLinks(html, finalUrl || pageUrl);
    const fresh = m.links.broken.filter((b) => !before.has(b.url));
    if (fresh.length) await alertLinks(email, pageUrl, fresh, m);
  }
}

const longDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const inDays = (n) => (n <= 0 ? "has run out" : n === 1 ? "runs out tomorrow" : `runs out in ${n} days`);
async function expiryAlerts(email, pageUrl, m) {
  const a = alertSettings(m);
  const host = new URL(pageUrl).hostname;
  m.expiryWarned ||= {};
  const due = [];
  const c = m.cert;
  if (c?.validTo) {
    const days = daysLeft(c.validTo);
    const step = stepFor(days, [14, 7, 1]);
    const w = m.expiryWarned.cert;
    if (step != null && (w?.for !== c.validTo || step < w.step)) {
      m.expiryWarned.cert = { for: c.validTo, step };
      due.push({
        kind: "certificate", days, on: c.validTo,
        subject: `${host}: security certificate ${inDays(days)}`,
        body: days <= 0
          ? `The security certificate for ${host} ran out on ${longDate(c.validTo)}. Browsers now warn visitors away from the site. Renew it in your host's domain settings.`
          : `The security certificate for ${host} ${inDays(days)} (${longDate(c.validTo)}). Once it does, browsers warn visitors away from the site. Most hosts renew it by themselves; this close to the date, check your host's domain settings.`,
      });
    }
  }
  if (c && c.trusted === false && c.problem && !/EXPIRED/i.test(c.problem)) {
    if (m.expiryWarned.untrusted !== c.problem) {
      m.expiryWarned.untrusted = c.problem;
      due.push({ kind: "certificate", subject: `${host}: browsers don't trust its security certificate`, body: `Browsers show a warning on ${host}: its security certificate isn't valid for this address (${c.problem}). Check the domain settings at your host.` });
    }
  } else if (c?.trusted) m.expiryWarned.untrusted = null;
  const d = m.domain;
  if (d?.expires) {
    const days = daysLeft(d.expires);
    const step = stepFor(days, [30, 7, 1]);
    const w = m.expiryWarned.domain;
    if (step != null && (w?.for !== d.expires || step < w.step)) {
      m.expiryWarned.domain = { for: d.expires, step };
      due.push({
        kind: "domain", days, on: d.expires,
        subject: `${d.domain} ${days <= 0 ? "has expired" : `expires in ${days} day${days === 1 ? "" : "s"}`}`,
        body: days <= 0
          ? `The registration for ${d.domain} ran out on ${longDate(d.expires)}. The site and any email on it can stop working at any moment. Renew it at ${d.registrar || "your registrar"} now.`
          : `The registration for ${d.domain} runs out on ${longDate(d.expires)}${d.registrar ? ` (registrar: ${d.registrar})` : ""}. If auto-renew is on with a card that works, there's nothing to do. If not, renew it before then, or the site and any email on it stop working.`,
      });
    }
  }
  if (!a.expiry) return;
  for (const x of due) {
    await mail(email, {
      subject: x.subject,
      text: `${x.body}\n\nhttps://stampmypage.com/dashboard#monitoring`,
      html: `<p>${x.body.replace(/[<>&]/g, "")}</p><p><a href="https://stampmypage.com/dashboard#monitoring">See it in your dashboard</a></p>`,
    }).catch(() => {});
    await postWebhook(a.webhook, { event: "expiry", kind: x.kind, url: pageUrl, host, daysLeft: x.days ?? null, on: x.on || null }, `🟠 ${x.subject}`);
  }
}

async function alertLinks(email, pageUrl, broken, m) {
  const a = alertSettings(m);
  if (!a.changes || inQuietHours(a)) return;
  const host = new URL(pageUrl).hostname;
  const line = (b) => `${b.label ? `"${b.label}" ` : ""}${b.url} (${b.status ? `answers ${b.status}` : b.why || "doesn't answer"})`;
  const subject = `${host}: ${broken.length} broken link${broken.length === 1 ? "" : "s"}`;
  await mail(email, {
    subject,
    text: `Stay Alive checked the links on ${pageUrl}. ${broken.length === 1 ? "This one leads" : "These lead"} nowhere:\n\n${broken.map(line).join("\n")}\n\nhttps://stampmypage.com/dashboard#monitoring`,
    html: `<p>Stay Alive checked the links on <a href="${pageUrl}">${pageUrl}</a>. ${broken.length === 1 ? "This one leads" : "These lead"} nowhere:</p><ul>${broken.map((b) => `<li>${line(b).replace(/[<>&]/g, "")}</li>`).join("")}</ul><p><a href="https://stampmypage.com/dashboard#monitoring">See it in your dashboard</a></p>`,
  }).catch(() => {});
  await postWebhook(a.webhook, { event: "links", url: pageUrl, host, broken }, `🟡 ${subject}\n${broken.slice(0, 10).map((b) => `• ${line(b)}`).join("\n")}`);
}

// Words the page must show. Each one is checked against the page now, so a phrase the page only draws later in
// the browser (which the checks can't see) is refused up front instead of raising false alarms.
export async function setMustHave(email, url, phrases) {
  const u = await getUser(email);
  const page = sitesOf(u).find((s) => s === url);
  if (!page || !hasStayAlive(u)) return null;
  const list = cleanPhrases(phrases);
  if (list.length) {
    const f = await pageFacts(page);
    if (f.error) throw new Error(`${f.error}, so we can't check the words right now. Try again in a minute.`);
    const gone = list.filter((p) => missingWord(f.html, [p]));
    if (gone.length) throw new Error(`We can't find ${gone.map((p) => `"${p}"`).join(", ")} in the page's HTML. If the page draws that text in the browser after it loads, the checks can't see it. Pick words from the title or the first screen, written as they are on the page.`);
  }
  const m = (await get(monitorKey(email, page))) || { url: page, checks: [] };
  m.mustHave = list;
  await set(monitorKey(email, page), m);
  return m;
}

// A test message to the webhook from the dashboard, so people see it land before they rely on it.
export async function testWebhook(raw) {
  const url = validWebhook(raw);
  if (!url) throw new Error("Paste a webhook URL first.");
  const r = await postWebhook(url, { event: "test", at: new Date().toISOString() }, "✅ Stamp My Page is connected. Down, recovery and change alerts for your site will show up here.");
  if (!r.ok) throw new Error(r.status ? `The webhook answered ${r.status}. Check the URL and try again.` : "The webhook didn't answer. Check the URL and try again.");
  return { kind: webhookKind(url) };
}

// --- Upgrade 3: history, incidents, weekly reports, public status. Pure helpers, so the
// dashboard, the public status page, and the weekly email all read the same numbers. ---
const monthKey = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
// Minutes spent down between from and to (ms), walking the history: each check holds until the next one.
export function downMinutes(checks = [], from = 0, to = Date.now()) {
  let down = 0;
  for (let i = 0; i < checks.length; i++) {
    if (checks[i].ok) continue;
    const a = Math.max(from, Date.parse(checks[i].at));
    const b = Math.min(to, i + 1 < checks.length ? Date.parse(checks[i + 1].at) : to);
    if (b > a) down += (b - a) / 60000;
  }
  return down;
}
// Uptime percent over a window, by time rather than by number of checks.
function uptimeOver(checks, from, to = Date.now()) {
  const first = checks.length ? Math.max(from, Date.parse(checks[0].at)) : to;
  const total = (to - first) / 60000;
  if (total <= 0) return checks.length ? (checks[checks.length - 1].ok ? 100 : 0) : null;
  return Math.round((1 - downMinutes(checks, first, to) / total) * 1000) / 10;
}

// Checks grouped by month, newest month first: checks, uptime percent, average speed.
export function monthlyHistory(checks = []) {
  const by = {};
  for (const c of checks) {
    const k = monthKey(c.at);
    if (!k) continue;
    (by[k] ||= { month: k, checks: 0, up: 0, ms: 0, okMs: 0 });
    by[k].checks++;
    if (c.ok) { by[k].up++; by[k].ms += c.ms || 0; by[k].okMs++; }
  }
  return Object.values(by).sort((a, b) => (a.month < b.month ? 1 : -1)).map((m) => ({
    ...m,
    uptime: m.checks ? uptimeOver(checks, Date.UTC(+m.month.slice(0, 4), +m.month.slice(5) - 1, 1), Math.min(Date.now(), Date.UTC(+m.month.slice(0, 4), +m.month.slice(5), 1))) : null,
    avgMs: m.okMs ? Math.round(m.ms / m.okMs) : null,
  }));
}
// Outages as incidents, not a list of failed checks: consecutive failed checks form one
// incident, from the first failed check to the first good check after it (or "still down").
export function incidentList(checks = []) {
  const out = [];
  let cur = null;
  for (const c of checks) {
    if (!c.ok && !cur) cur = { start: c.at, status: c.status || 0 };
    if (c.ok && cur) { cur.end = c.at; out.push(cur); cur = null; }
  }
  if (cur) out.push({ ...cur, ongoing: true });
  return out.reverse();
}
// The numbers a report and the public status page share. Window defaults to the last 30
// days (public status); the weekly email passes 7. With less history than the window it
// says so instead of inventing a full window.
export function reportSummary(m = {}, windowDays = 30) {
  const checks = (m.checks || []).filter((c) => Date.now() - new Date(c.at).getTime() <= windowDays * 86400000);
  const windowChecks = checks.length ? checks : (m.checks || []);
  const up = windowChecks.filter((c) => c.ok);
  const restamps = (m.restamps || []).filter((r) => !r.failed && r.score != null);
  const first = restamps[0];
  const lastR = restamps[restamps.length - 1];
  const recentChanges = (m.changes || []).filter((c) => Date.now() - new Date(c.at).getTime() <= windowDays * 86400000);
  return {
    host: (() => { try { return new URL(m.url).hostname; } catch (_) { return m.url || ""; } })(),
    url: m.url || "",
    windowDays: checks.length ? windowDays : null,
    checks: windowChecks.length,
    uptime: windowChecks.length ? uptimeOver(m.checks || [], Date.now() - windowDays * 86400000) : null,
    avgMs: up.length ? Math.round(up.reduce((a, c) => a + (c.ms || 0), 0) / up.length) : null,
    currentUp: windowChecks.length ? !!windowChecks[windowChecks.length - 1].ok : null,
    lastCheckAt: m.lastCheckAt || null,
    scoreFrom: first?.score ?? null, scoreTo: lastR?.score ?? null,
    verdictTo: lastR?.verdict || null, latestStampId: lastR?.id || null,
    changes: recentChanges.length, incidents: incidentList(windowChecks),
  };
}
function reportMail(email, m, s) {
  const inc = s.incidents.map((i) => i.ongoing ? `Down since ${new Date(i.start).toDateString()}, still down` : `Down ${new Date(i.start).toDateString()}${i.end ? `, back ${new Date(i.end).toDateString()}` : ""}`).join("\n");
  const scoreLine = s.scoreFrom != null && s.scoreTo != null ? `Score: ${s.scoreFrom} to ${s.scoreTo}${s.scoreTo > s.scoreFrom ? " (up)" : s.scoreTo < s.scoreFrom ? " (down)" : " (unchanged)"}.` : "No scored re-stamp in this period yet.";
  const upColor = s.currentUp ? "#15803d" : "#b91c1c";
  const upWord = s.currentUp == null ? "Checking" : s.currentUp ? "Up" : "Down";
  const escH = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const text = `Your Stay Alive weekly report for ${s.host}\n\n` +
    `Uptime: ${s.uptime != null ? `${s.uptime}%` : "not yet"} over ${s.checks} check${s.checks === 1 ? "" : "s"}${s.windowDays ? " in the last 7 days" : " so far"}.\n` +
    `Average server answer: ${s.avgMs != null ? `${s.avgMs} ms` : "not yet"}.\n` +
    `Right now: ${upWord}.\n` +
    `${scoreLine}\n` +
    `Changes spotted: ${s.changes}. Outages: ${s.incidents.length}.\n` +
    (inc ? `\nOutages:\n${inc}\n` : "") +
    `\nDetails in your dashboard: https://stampmypage.com/dashboard`;
  // Table layout with inline styles only, like the stamp verdict email: email clients
  // ignore <style> blocks, so a plain <ul> renders as the generic list the user saw.
  const html = `<!doctype html><html><body style="margin:0;background:#f6f5fc;color:#12132a;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px" cellpadding="0" cellspacing="0">
<tr><td><img src="https://stampmypage.com/brand/smp-lockup.png" alt="StampMyPage" width="180" style="display:block;height:auto"></td></tr>
<tr><td style="padding-top:24px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#5d6180">Stay Alive · Weekly report</td></tr>
<tr><td style="padding-top:8px;font-size:32px;font-weight:800;letter-spacing:-1px;line-height:1.1">${escH(s.host)}</td></tr>
<tr><td style="padding-top:12px"><span style="display:inline-block;background:${s.currentUp ? "#dcfce7" : "#fee2e2"};color:${upColor};font-weight:700;font-size:15px;border-radius:999px;padding:6px 14px">● ${upWord}</span></td></tr>
<tr><td style="padding-top:24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="50%" style="border:1px solid #e6e3f1;border-radius:12px;padding:14px 16px;background:#ffffff"><div style="font-size:24px;font-weight:800">${s.uptime != null ? `${s.uptime}%` : "n/a"}</div><div style="font-size:13px;color:#5d6180">Uptime, last 7 days</div></td>
<td width="50%" style="border:1px solid #e6e3f1;border-radius:12px;padding:14px 16px;background:#ffffff"><div style="font-size:24px;font-weight:800">${s.avgMs != null ? `${s.avgMs} ms` : "n/a"}</div><div style="font-size:13px;color:#5d6180">Average answer</div></td>
</tr><tr><td colspan="2" style="padding-top:12px"></td></tr><tr>
<td width="50%" style="border:1px solid #e6e3f1;border-radius:12px;padding:14px 16px;background:#ffffff"><div style="font-size:24px;font-weight:800">${s.scoreTo != null ? `${s.scoreTo}/100` : "n/a"}</div><div style="font-size:13px;color:#5d6180">Latest stamp score</div></td>
<td width="50%" style="border:1px solid #e6e3f1;border-radius:12px;padding:14px 16px;background:#ffffff"><div style="font-size:24px;font-weight:800">${s.incidents.length}</div><div style="font-size:13px;color:#5d6180">Outages this week</div></td>
</tr></table></td></tr>
<tr><td style="padding-top:24px;font-size:15px;line-height:1.6">${escH(scoreLine)}<br>Changes spotted: <b>${s.changes}</b> · Checks: <b>${s.checks}</b>${s.windowDays ? " in the last 7 days" : " so far"}.</td></tr>
${s.incidents.length ? `<tr><td style="padding-top:16px;font-size:15px;line-height:1.6"><b>Outages:</b><br>${escH(inc).replace(/\n/g, "<br>")}</td></tr>` : ""}
<tr><td style="padding-top:24px"><a href="https://stampmypage.com/dashboard" style="display:inline-block;background:#12132a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:12px;padding:14px 22px">View dashboard</a></td></tr>
<tr><td style="padding-top:32px;font-size:12px;color:#5d6180">Stamp My Page · Stay Alive. Your page, watched every day, reported every week.</td></tr>
</table></td></tr></table></body></html>`;
  return mail(email, { subject: `Stay Alive weekly report: ${s.host} at ${s.uptime != null ? `${s.uptime}%` : "checking"} uptime`, text, html });
}
// One weekly report per watched site, at most every 7 days, only once a site has at
// least 7 checks, so a brand new site does not get a report built on one check. Runs
// inside the daily cron; a failed send never blocks the daily checks. Weekly, not
// monthly, because Stay Alive itself is a monthly sub: a month between proofs is too slow.
export async function sendWeeklyReports() {
  const emails = await members("idx:members");
  let sent = 0;
  for (const email of emails) {
    const u = await getUser(email).catch(() => null);
    if (!hasStayAlive(u)) continue;
    for (const url of watchedSites(u)) {
      try {
        const m = (await get(monitorKey(email, url))) || { url, checks: [] };
        if ((m.checks || []).length < 7) continue;
        if (m.lastReportAt && Date.now() - new Date(m.lastReportAt).getTime() < 7 * 86400000) continue;
        await reportMail(email, m, reportSummary(m, 7));
        m.lastReportAt = new Date().toISOString();
        await set(monitorKey(email, url), m);
        sent++;
      } catch (e) { console.error("Weekly report failed:", e); }
    }
  }
  return sent;
}
// Send this week's report for one site right now, from the dashboard. Used for review
// and for owners who want the report on demand; it also resets the 7-day clock.
export async function sendReportNow(email, url) {
  const u = await getUser(email);
  const page = sitesOf(u).find((s) => s === url);
  if (!page || !hasStayAlive(u)) return null;
  const m = (await get(monitorKey(email, page))) || { url: page, checks: [] };
  await reportMail(email, m, reportSummary(m, 7));
  m.lastReportAt = new Date().toISOString();
  await set(monitorKey(email, page), m);
  return m;
}
// Public status: opt-in only. The owner turns it on in the dashboard; the page then
// shows uptime, speed, and the latest stamp only, never the email, the stack, or changes.
export async function setPublicStatus(email, url, on) {
  const u = await getUser(email);
  const page = sitesOf(u).find((s) => s === url);
  if (!page || !hasStayAlive(u)) return null;
  const m = (await get(monitorKey(email, page))) || { url: page, checks: [] };
  m.publicStatus = !!on;
  await set(monitorKey(email, page), m);
  return m;
}
export async function findPublicMonitor(id) {
  const emails = await members("idx:members");
  for (const email of emails) {
    const u = await getUser(email).catch(() => null);
    if (!hasStayAlive(u)) continue;
    for (const url of sitesOf(u)) {
      if (siteId(url) !== id) continue;
      const m = await get(monitorKey(email, url)).catch(() => null);
      if (m?.publicStatus) return { ...m, url };
    }
  }
  return null;
}

// The daily run for every watched site of every Stay Alive member. A few at a time, so the run fits in one call.
export async function monitorAll() {
  const emails = await members("idx:members");
  const jobs = [];
  for (const email of emails) {
    const u = await getUser(email).catch(() => null);
    if (hasStayAlive(u)) for (const url of watchedSites(u)) jobs.push([email, url]);
  }
  const out = { checked: 0, restamped: 0 };
  for (let i = 0; i < jobs.length; i += 4) {
    const batch = await Promise.allSettled(jobs.slice(i, i + 4).map(([e, url]) => runMonitor(e, { url })));
    for (const b of batch) if (b.status === "fulfilled" && b.value && !b.value.pausedManual) {
      out.checked++;
      if (b.value.restamps?.at(-1)?.at === b.value.lastRestampAt && Date.now() - new Date(b.value.lastRestampAt).getTime() < 600000) out.restamped++;
    }
  }
  try { out.reports = await sendWeeklyReports(); } catch (e) { console.error("Weekly reports failed:", e); }
  return out;
}

// The history of every site on the account, for the dashboard. A site with no history yet comes back as { url }.
export async function readMonitors(email, u) {
  const watched = watchedSites(u);
  return Promise.all(sitesOf(u).map(async (url) => { const m = (await get(monitorKey(email, url))) || {}; return { ...m, url, paused: !watched.includes(url), publicId: m.publicStatus ? siteId(url) : null }; }));
}

export const forgetSite = (email, url) => remove(monitorKey(email, url));
