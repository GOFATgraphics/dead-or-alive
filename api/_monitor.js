// Stay Alive: pages watched for their owner. Every day (Vercel cron) each is checked for uptime and speed; every
// week it's re-stamped. The first check and re-stamp run the moment the membership starts, or a site is added.
// The plan includes one site; each extra one is a paid seat on the subscription. Results live in
// monitor:<email>:<site id> and show in the dashboard. A page that goes down gets an email, when email is set up.
import crypto from "node:crypto";
import { get, remove, set, members } from "./_store.js";
import { getUser, hasStayAlive } from "./_account.js";
import { stampNow } from "./_stamp.js";
import { mail } from "./_publish.js";

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

const siteId = (url) => crypto.createHash("sha256").update(url).digest("base64url").slice(0, 12);
export const monitorKey = (email, url) => `monitor:${email}:${siteId(url)}`;
const WEEK = 6.5 * 86400000; // a little under a week, so a daily cron never skips one

// One uptime and speed check: did it answer, with what status, how fast.
export async function checkOnce(pageUrl) {
  const t0 = Date.now();
  try {
    const r = await fetch(pageUrl, { redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "User-Agent": "Mozilla/5.0 (compatible; StampMyPage-Monitor/1.0; +https://stampmypage.com)" } });
    const firstByte = Date.now() - t0;
    await r.arrayBuffer().catch(() => null);
    return { at: new Date().toISOString(), ok: r.status < 400, status: r.status, ms: firstByte, totalMs: Date.now() - t0 };
  } catch (err) {
    return { at: new Date().toISOString(), ok: false, status: 0, ms: Date.now() - t0, error: /timeout|abort/i.test(String(err?.name || err)) ? "No answer in 15s" : "Could not connect" };
  }
}

// Checks one of a member's sites (the first, unless one is named), re-stamps it when a week has passed (or when
// forced), and saves the history.
export async function runMonitor(email, { restamp = false, url = "" } = {}) {
  const u = await getUser(email);
  const watched = watchedSites(u);
  const pageUrl = url ? watched.find((s) => s === url) : watched[0];
  if (!pageUrl || !hasStayAlive(u)) return null;
  const m = (await get(monitorKey(email, pageUrl))) || { url: pageUrl, checks: [], restamps: [] };
  const check = await checkOnce(pageUrl);
  const wasUp = m.checks.length ? m.checks[m.checks.length - 1].ok : true;
  m.checks = [...m.checks, check].slice(-90);
  m.lastCheckAt = check.at;
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
        await alertChange(email, pageUrl, change);
      }
    }
  }
  await set(monitorKey(email, pageUrl), m);
  if (wasUp && !check.ok) {
    await mail(email, {
      subject: `Your page is down: ${new URL(pageUrl).hostname}`,
      text: `Stay Alive checked ${pageUrl} at ${check.at} and it ${check.status ? `answered ${check.status}` : check.error.toLowerCase()}.\n\nSee the history in your dashboard: https://stampmypage.com/dashboard`,
      html: `<p>Stay Alive checked <a href="${pageUrl}">${pageUrl}</a> at ${check.at} and it ${check.status ? `answered ${check.status}` : check.error.toLowerCase()}.</p><p><a href="https://stampmypage.com/dashboard">See the history in your dashboard</a></p>`,
    }).catch(() => {});
  }
  return m;
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

async function alertChange(email, pageUrl, c) {
  const host = new URL(pageUrl).hostname;
  const lines = [
    ...c.added.map((t) => `Added: ${t}`),
    ...c.removed.map((t) => `Removed: ${t}`),
    c.lcp ? `Main content now shows in ${(c.lcp.to / 1000).toFixed(1)}s (was ${(c.lcp.from / 1000).toFixed(1)}s)` : "",
    c.verdict ? `Stamp went from ${c.verdict.from} to ${c.verdict.to}` : "",
  ].filter(Boolean);
  await mail(email, {
    subject: `${host} changed: ${c.verdict ? `now ${c.verdict.to}` : c.pixels ? "tracking changed" : c.lcp ? "speed changed" : "stack changed"}`,
    text: `Stay Alive re-stamped ${pageUrl} and noticed:\n\n${lines.join("\n")}\n\nDetails in your dashboard: https://stampmypage.com/dashboard`,
    html: `<p>Stay Alive re-stamped <a href="${pageUrl}">${pageUrl}</a> and noticed:</p><ul>${lines.map((l) => `<li>${l.replace(/[<>&]/g, "")}</li>`).join("")}</ul><p><a href="https://stampmypage.com/dashboard">Details in your dashboard</a></p>`,
  }).catch(() => {});
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
    for (const b of batch) if (b.status === "fulfilled" && b.value) {
      out.checked++;
      if (b.value.restamps?.at(-1)?.at === b.value.lastRestampAt && Date.now() - new Date(b.value.lastRestampAt).getTime() < 600000) out.restamped++;
    }
  }
  return out;
}

// The history of every site on the account, for the dashboard. A site with no history yet comes back as { url }.
export async function readMonitors(email, u) {
  const watched = watchedSites(u);
  return Promise.all(sitesOf(u).map(async (url) => ({ ...((await get(monitorKey(email, url))) || {}), url, paused: !watched.includes(url) })));
}

export const forgetSite = (email, url) => remove(monitorKey(email, url));
