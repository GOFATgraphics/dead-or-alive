// Stay Alive: a page watched for its owner. Every day (Vercel cron) it's checked for uptime and speed; every
// week it's re-stamped. The first check and re-stamp run the moment the membership starts.
// Results live in monitor:<email> and show in the dashboard. A page that goes down gets an email, when email is set up.
import { get, set, members } from "./_store.js";
import { getUser, hasStayAlive } from "./_account.js";
import { stampNow } from "./_stamp.js";
import { mail } from "./_publish.js";

export const monitorKey = (email) => `monitor:${email}`;
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

// Checks one member's page, re-stamps it when a week has passed (or when forced), and saves the history.
export async function runMonitor(email, { restamp = false } = {}) {
  const u = await getUser(email);
  const pageUrl = u?.stayAlive?.url;
  if (!pageUrl || !hasStayAlive(u)) return null;
  const m = (await get(monitorKey(email))) || { url: pageUrl, checks: [], restamps: [] };
  if (m.url !== pageUrl) Object.assign(m, { url: pageUrl, checks: [], restamps: [] });
  const check = await checkOnce(pageUrl);
  const wasUp = m.checks.length ? m.checks[m.checks.length - 1].ok : true;
  m.checks = [...m.checks, check].slice(-90);
  m.lastCheckAt = check.at;
  const due = restamp || !m.lastRestampAt || Date.now() - new Date(m.lastRestampAt).getTime() > WEEK;
  if (due && check.ok) {
    m.restampRunning = true;
    await set(monitorKey(email), m);
    const r = await stampNow(pageUrl).catch((e) => ({ failed: e.message }));
    m.restampRunning = false;
    m.lastRestampAt = new Date().toISOString();
    m.restamps = [...m.restamps, r.failed ? { at: m.lastRestampAt, failed: String(r.failed).slice(0, 200) } : { at: m.lastRestampAt, id: r.id, verdict: r.verdict, score: r.score, lcp: r.snapshot?.browser?.lcp || null }].slice(-30);
  }
  await set(monitorKey(email), m);
  if (wasUp && !check.ok) {
    await mail(email, {
      subject: `Your page is down: ${new URL(pageUrl).hostname}`,
      text: `Stay Alive checked ${pageUrl} at ${check.at} and it ${check.status ? `answered ${check.status}` : check.error.toLowerCase()}.\n\nSee the history in your dashboard: https://stampmypage.com/dashboard`,
      html: `<p>Stay Alive checked <a href="${pageUrl}">${pageUrl}</a> at ${check.at} and it ${check.status ? `answered ${check.status}` : check.error.toLowerCase()}.</p><p><a href="https://stampmypage.com/dashboard">See the history in your dashboard</a></p>`,
    }).catch(() => {});
  }
  return m;
}

// The daily run for every Stay Alive member. A few at a time, so the run fits in one function call.
export async function monitorAll() {
  const emails = await members("idx:members");
  const out = { checked: 0, restamped: 0 };
  for (let i = 0; i < emails.length; i += 4) {
    const batch = await Promise.allSettled(emails.slice(i, i + 4).map((e) => runMonitor(e)));
    for (const b of batch) if (b.status === "fulfilled" && b.value) {
      out.checked++;
      if (b.value.restamps?.at(-1)?.at === b.value.lastRestampAt && Date.now() - new Date(b.value.lastRestampAt).getTime() < 600000) out.restamped++;
    }
  }
  return out;
}

export const readMonitor = (email) => get(monitorKey(email));
