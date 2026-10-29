// Stay Alive's extra checks for a watched site: when the security certificate and the domain run out, what the
// page tells Google, words the page must show, and links that lead nowhere. Plain checks only; _monitor.js keeps
// the results and sends the alerts.
import tls from "node:tls";
import { assertPublic, attr, meta, safeFetch, text } from "./_inspect.js";

const DAY = 86400000;
const UA = "Mozilla/5.0 (compatible; StampMyPage-Monitor/1.0; +https://stampmypage.com)";
export const daysLeft = (iso, now = Date.now()) => (iso ? Math.floor((Date.parse(iso) - now) / DAY) : null);

// --- Security certificate: when it runs out, and whether browsers trust it. ---
export function certificate(host) {
  return new Promise((resolve) => {
    const at = new Date().toISOString();
    let s;
    const done = (v) => { try { s.destroy(); } catch (_) {} resolve(v); };
    s = tls.connect({ host, port: 443, servername: host, timeout: 10000, rejectUnauthorized: false }, () => {
      const c = s.getPeerCertificate();
      done({
        at,
        validTo: c?.valid_to ? new Date(c.valid_to).toISOString() : null,
        issuer: String(c?.issuer?.O || c?.issuer?.CN || "").slice(0, 80),
        trusted: !!s.authorized,
        problem: s.authorized ? "" : String(s.authorizationError || "").slice(0, 80),
      });
    });
    s.on("timeout", () => done({ at, error: "No answer on https in 10 seconds" }));
    s.on("error", () => done({ at, error: "Could not reach https" }));
  });
}

// --- Domain: when the registration runs out, from the registry's public record (RDAP). Sites on a shared
// address (yourapp.vercel.app and the like) have nothing of their own to renew. ---
const SHARED = /(?:^|\.)(vercel\.app|netlify\.app|github\.io|pages\.dev|workers\.dev|web\.app|firebaseapp\.com|onrender\.com|herokuapp\.com|fly\.dev|railway\.app|up\.railway\.app|replit\.app|repl\.co|lovable\.app|bolt\.host|netlify\.com|framer\.website|framer\.app|framer\.ai|webflow\.io|carrd\.co|wixsite\.com|squarespace\.com|super\.site|notion\.site|glitch\.me|surge\.sh|azurewebsites\.net|amplifyapp\.com|cloudfront\.net|myshopify\.com|wordpress\.com|blogspot\.com|substack\.com|gitbook\.io|ghost\.io|softr\.app|bubbleapps\.io|glide\.page|base44\.app|vercel\.dev|gumroad\.com|beehiiv\.com|typedream\.app|durable\.co|hostinger\.site|godaddysites\.com)$/i;
export function registrable(host) {
  const h = String(host || "").toLowerCase().replace(/\.$/, "");
  const shared = SHARED.exec(h);
  if (shared) return { shared: shared[1] };
  const p = h.split(".");
  const two = p.length > 2 && p[p.length - 1].length === 2 && /^(co|com|net|org|gov|edu|ac|or|ne|go|ltd|plc|me|sch|nom|gen|biz|info|web)$/.test(p[p.length - 2]);
  return { domain: p.slice(two ? -3 : -2).join(".") };
}
export async function domainExpiry(host) {
  const at = new Date().toISOString();
  const r = registrable(host);
  if (r.shared) return { at, shared: r.shared };
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(r.domain)}`, { redirect: "follow", headers: { accept: "application/rdap+json, application/json", "user-agent": UA }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { at, domain: r.domain, error: res.status === 404 ? "This registry doesn't publish renewal dates" : "The registry didn't answer" };
    const d = await res.json();
    const ev = (d.events || []).find((e) => /expir/i.test(e.eventAction || ""));
    const reg = (d.entities || []).find((e) => (e.roles || []).includes("registrar"));
    const registrar = String((reg?.vcardArray?.[1] || []).find((v) => v[0] === "fn")?.[3] || "").slice(0, 80);
    const expires = ev?.eventDate && !Number.isNaN(Date.parse(ev.eventDate)) ? new Date(ev.eventDate).toISOString() : null;
    return { at, domain: r.domain, expires, registrar, ...(expires ? {} : { error: "This registry doesn't publish renewal dates" }) };
  } catch (_) {
    return { at, domain: r.domain, error: "The registry didn't answer" };
  }
}

// Which warning a date has reached: the smallest step it's inside, 0 once it has run out, null when it's far off.
export function stepFor(days, steps) {
  if (days == null) return null;
  if (days < 0) return 0;
  const hit = steps.filter((s) => days <= s);
  return hit.length ? Math.min(...hit) : null;
}

// --- Google: what the page and robots.txt tell search engines. ---
const toRe = (rule) => new RegExp("^" + rule.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*"));
// Does robots.txt keep Googlebot off this path? Google's rules: its own group if there is one, else the * group;
// the longest matching rule wins, and Allow wins a tie.
export function robotsBlock(txt, path) {
  const groups = [];
  let cur = null;
  let agentLine = false;
  for (const raw of String(txt || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const k = m[1].toLowerCase();
    const v = m[2].trim();
    if (k === "user-agent") {
      if (!cur || !agentLine) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(v.toLowerCase());
      agentLine = true;
    } else {
      agentLine = false;
      if (cur && (k === "allow" || k === "disallow") && v) cur.rules.push({ allow: k === "allow", path: v });
    }
  }
  const own = groups.filter((g) => g.agents.includes("googlebot"));
  const rules = (own.length ? own : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
  let best = null;
  for (const r of rules) {
    let re;
    try { re = toRe(r.path); } catch (_) { continue; }
    if (!re.test(path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return !!best && !best.allow;
}
async function robotsBlocks(pageUrl) {
  const u = new URL(pageUrl);
  try {
    await assertPublic(`${u.origin}/`);
    const r = await fetch(`${u.origin}/robots.txt`, { redirect: "follow", headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return false;
    return robotsBlock((await r.text()).slice(0, 300000), u.pathname + u.search);
  } catch (_) {
    return false;
  }
}

// What the page says to Google, plus its HTML for the word and link checks (never stored).
export async function pageFacts(pageUrl) {
  const at = new Date().toISOString();
  let f;
  try {
    f = await safeFetch(pageUrl);
  } catch (err) {
    return { at, error: err.name === "TimeoutError" ? "The page took too long to answer" : "Could not load the page" };
  }
  const html = f.html;
  const robots = `${meta(html, "robots")} ${meta(html, "googlebot")}`.toLowerCase();
  const header = String(f.res.headers.get("x-robots-tag") || "").toLowerCase();
  const rawCanon = attr(html, /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i) || attr(html, /<link[^>]+href=["']([^"']*)["'][^>]*rel=["']canonical["']/i);
  let canonical = "";
  try { canonical = rawCanon ? new URL(rawCanon, f.finalUrl).toString() : ""; } catch (_) {}
  const bare = (h) => h.replace(/^www\./, "");
  return {
    at,
    status: f.res.status,
    title: text(attr(html, /<title[^>]*>([^<]*)<\/title>/i)).slice(0, 200),
    description: text(meta(html, "description")).slice(0, 300),
    image: meta(html, "og:image").slice(0, 500),
    canonical: canonical.slice(0, 500),
    canonicalElsewhere: !!canonical && bare(new URL(canonical).hostname) !== bare(new URL(f.finalUrl).hostname),
    noindex: /\b(noindex|none)\b/.test(robots) || /\b(noindex|none)\b/.test(header),
    robotsBlocked: await robotsBlocks(f.finalUrl),
    finalUrl: f.finalUrl,
    html,
  };
}

// What changed for Google since the last look. Each line is bad (Google may drop the page), good (fixed), or
// info. The first look only reports problems already there.
const short = (s) => (s ? `"${s.length > 90 ? s.slice(0, 88) + "…" : s}"` : "nothing");
export function googleDiff(before, now) {
  if (!now || now.error || (before && before.error)) return [];
  const out = [];
  const flip = (key, bad, good) => {
    if (now[key] && !before?.[key]) out.push({ tone: "bad", text: bad });
    else if (before && !now[key] && before[key]) out.push({ tone: "good", text: good });
  };
  flip("noindex", "The page now tells Google not to list it (a noindex tag).", "The page lets Google list it again (noindex is gone).");
  flip("robotsBlocked", "robots.txt now blocks Google from this page.", "robots.txt lets Google in again.");
  flip("canonicalElsewhere", `The page now tells Google another site is the original (canonical: ${now.canonical}).`, "The canonical tag points back to this site.");
  if (!before) return out;
  if (before.title !== now.title) out.push({ tone: now.title ? "info" : "bad", text: now.title ? `Title changed from ${short(before.title)} to ${short(now.title)}.` : "The page title was removed." });
  if (before.description !== now.description) out.push({ tone: now.description ? "info" : "bad", text: now.description ? `Description changed from ${short(before.description)} to ${short(now.description)}.` : "The description was removed." });
  if (before.image !== now.image) out.push({ tone: now.image ? "info" : "bad", text: now.image ? "The share image changed." : "The share image was removed, so shared links show no picture." });
  return out;
}

// --- Words the page must show. Read from the page's HTML, so it works on every 5-minute check. ---
const norm = (s) => text(s).toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ");
export function missingWord(html, phrases = []) {
  if (!phrases.length) return "";
  const t = norm(String(html || "").replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, " "));
  return phrases.find((p) => !t.includes(norm(p))) || "";
}
export function cleanPhrases(list) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const p = String(raw || "").replace(/\s+/g, " ").trim();
    if (!p) continue;
    if (p.length < 2 || p.length > 80) throw new Error("Each phrase must be 2 to 80 characters.");
    if (!out.some((x) => x.toLowerCase() === p.toLowerCase())) out.push(p);
  }
  if (out.length > 5) throw new Error("Up to 5 phrases per site.");
  return out;
}

// --- Links that lead nowhere: every link in the page's HTML (up to 60), checked once a week. A link is broken
// when it answers 404 or 410, a server error, or the address doesn't exist. Bot walls (401, 403, 429, 999)
// count as fine: a person in a browser gets through. ---
export function linksIn(html, base) {
  const seen = new Map();
  const body = String(html || "").replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, " ");
  for (const m of body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = (/\bhref\s*=\s*["']([^"']+)["']/i.exec(m[1]) || [])[1];
    if (!href || /^(#|mailto:|tel:|javascript:|sms:|data:)/i.test(href.trim())) continue;
    let url;
    try { url = new URL(href.trim(), base); } catch (_) { continue; }
    if (!/^https?:$/.test(url.protocol)) continue;
    url.hash = "";
    const key = url.toString();
    if (!seen.has(key)) seen.set(key, text(m[2]).slice(0, 60) || (/\baria-label=["']([^"']+)["']/i.exec(m[1]) || [])[1] || "");
  }
  return [...seen].slice(0, 60).map(([url, label]) => ({ url, label }));
}
async function linkStatus(start) {
  let url = start;
  for (let hop = 0; hop <= 5; hop++) {
    try {
      await assertPublic(url);
    } catch (err) {
      if (/ENOTFOUND|ENODATA/i.test(`${err.code} ${err.message}`)) return { status: 0, why: "That address doesn't exist" };
      return { status: -1 }; // private or odd addresses: not ours to judge
    }
    let r;
    try {
      r = await fetch(url, { method: "HEAD", redirect: "manual", headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000) });
      if ([403, 405, 501].includes(r.status)) r = await fetch(url, { redirect: "manual", headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000) });
      r.body?.cancel().catch(() => {});
    } catch (err) {
      return err.name === "TimeoutError" ? { status: -1 } : { status: 0, why: "Could not connect" };
    }
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
      url = new URL(r.headers.get("location"), url).toString();
      continue;
    }
    return { status: r.status };
  }
  return { status: -1 };
}
export async function brokenLinks(html, base) {
  const links = linksIn(html, base);
  const broken = [];
  for (let i = 0; i < links.length; i += 8) {
    const res = await Promise.all(links.slice(i, i + 8).map(async (l) => ({ ...l, ...(await linkStatus(l.url)) })));
    for (const l of res) if (l.status === 0 || l.status === 404 || l.status === 410 || l.status >= 500) broken.push({ url: l.url.slice(0, 300), label: l.label, status: l.status, why: l.why || "" });
  }
  return { at: new Date().toISOString(), checked: links.length, broken };
}
