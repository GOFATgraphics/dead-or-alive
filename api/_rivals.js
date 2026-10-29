// Finds a member's competitors, without a paid search service and without AI: read what their page says, look for
// pages that say the same from three free places (pages stamped here, Hacker News launches, and public web search),
// then load every candidate and keep only live product pages whose own words match. Each source can fail on its
// own; the scan still answers with whatever the others found.
import { assertPublic, attr, meta, text } from "./_inspect.js";
import { get, set } from "./_store.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const PAGES_KEY = "idx:pages";
const PAGES_MAX = 1500;

// Words that say nothing about what a product is.
const STOP = new Set(`a about above after again all also am an and any are as at be because been before being below best better between
both but by can could did do does doing done down during each easy easier even ever every everything fast faster few first for free from
get gets getting go going good great had has have having help helps here how i if in into is it its just know let lets like made make makes
making many more most much my need new next no not now of off on once one only or other our out over own people per really right same see
seconds minutes hours days simple simply so some start started still such take than that the their them then there these they thing things
this those through time to today too try under up us use used uses using very want way ways we well were what when where which while who
why will with without work works would you your yours yourself home official welcome isnt dont doesnt cant wont arent find finds found out let's login log sign signup account
learn read view click here menu close open back skip today latest blog news contact about privacy terms cookie cookies policy rights
reserved copyright inc ltd llc company team ai powered platform software tool tools app apps online solution solutions service services
product products feature features world world's leading modern powerful smart smarter next-gen future unlock seamless`.split(/\s+/));

const IGNORE_HOSTS = /(^|\.)(google|bing|duckduckgo|yahoo|baidu|yandex|apple|microsoft|amazon|youtube|youtu|facebook|instagram|tiktok|twitter|x|linkedin|reddit|pinterest|quora|medium|substack|wikipedia|wikimedia|github|gitlab|bitbucket|stackoverflow|stackexchange|producthunt|ycombinator|indiehackers|g2|capterra|getapp|softwareadvice|trustpilot|alternativeto|saasworthy|crunchbase|techcrunch|forbes|theverge|wired|nytimes|bbc|cnn|businessinsider|blogspot|tumblr|dev|hashnode|apps\.apple|play\.google|chromewebstore|chrome|mozilla|npmjs|pypi|docs|support|help|w3|archive|t|bit|tinyurl|stampmypage)\.[a-z.]+$/i;
const SHARED_HOSTS = /\.(vercel\.app|netlify\.app|github\.io|pages\.dev|web\.app|onrender\.com|herokuapp\.com|fly\.dev|railway\.app|replit\.app|lovable\.app|framer\.website|webflow\.io|carrd\.co|notion\.site|wixsite\.com|myshopify\.com)$/i;
const ARTICLE_PATH = /\/(blog|posts?|articles?|news|story|stories|guides?|learn|docs?|wiki|forum|questions?|tag|tags|category|categories|press|careers|jobs|compare|vs|alternatives?|reviews?|best|top)\b|\/20\d\d\/|\.(pdf|png|jpe?g)$/i;

const bare = (h) => String(h || "").toLowerCase().replace(/^www\./, "");
// The name a site is known by (two labels, three for co.uk-style endings), so app.x.com and x.com count as one site.
const siteOf = (host) => {
  const p = bare(host).split(".");
  const two = p.length > 2 && p[p.length - 1].length === 2 && /^(co|com|net|org|ac|gov|edu)$/.test(p[p.length - 2]);
  return p.slice(two ? -3 : -2).join(".");
};

// --- What a page is about: weighted words and two-word phrases. ---
// Words cut to a common stem, so "converting", "conversion" and "convert" match. The first spelling seen of each
// stem is kept to show the member ("shared: conversion, landing").
const SPELLING = new Map();
const stem = (w) => {
  const s = w.replace(/(ations|ation|ings|ing|ions|ion|ers|er|ed|es|s)$/, "");
  return (s.length >= 4 ? s : w).slice(0, 6);
};
function words(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9+#]+/)
    .filter((w) => w.length >= 3 && w.length <= 24 && !/^\d+$/.test(w) && !STOP.has(w))
    .map((w) => {
      const k = stem(w);
      if (!SPELLING.has(k)) SPELLING.set(k, w);
      return k;
    });
}
const spell = (k) => k.split(" ").map((x) => SPELLING.get(x) || x).join(" ");
// Words most pages share count for less.
const LOW = new Set(["page", "site", "websit", "web", "user", "custom", "busine", "data", "check", "fix", "paste", "url", "click"]);
function add(map, list, weight) {
  for (const w of list) map.set(w, (map.get(w) || 0) + weight * (LOW.has(w) ? 0.3 : 1));
}
function phrases(s) {
  const out = [];
  for (const part of String(s || "").toLowerCase().split(/[.,:;!?|·•\-–—()]+/)) {
    const ws = words(part);
    for (let i = 0; i + 1 < ws.length; i++) out.push(`${ws[i]} ${ws[i + 1]}`);
  }
  return out;
}
// brand: the product's own name, which says nothing about what it does and would only find itself.
export function profile({ title = "", description = "", h1 = "", subhead = "", body = "", brand = [] }) {
  const terms = new Map();
  const head = `${title}. ${h1}. ${description}. ${subhead}`;
  add(terms, words(title), 3);
  add(terms, words(h1), 3);
  add(terms, words(description), 3);
  add(terms, words(subhead), 2);
  add(terms, words(String(body).slice(0, 4000)), 0.5);
  const own = new Set(brand.flatMap((b) => words(b)));
  for (const b of own) terms.delete(b);
  const pairs = new Map();
  add(pairs, phrases(head).filter((p) => !p.split(" ").some((w) => own.has(w))), 1);
  return {
    terms: new Map([...terms].sort((a, b) => b[1] - a[1]).slice(0, 30)),
    phrases: [...pairs].sort((a, b) => b[1] - a[1]).map(([p]) => p).slice(0, 6),
  };
}
// How alike two pages are: cosine of their word weights, plus a bonus for each shared two-word phrase.
export function likeness(me, them) {
  let dot = 0, a = 0, b = 0;
  const shared = [];
  for (const [w, x] of me.terms) {
    a += x * x;
    const y = them.terms.get(w) || 0;
    if (y) { dot += x * y; shared.push([w, x * y]); }
  }
  for (const [, y] of them.terms) b += y * y;
  const cos = a && b ? dot / Math.sqrt(a * b) : 0;
  const both = me.phrases.filter((p) => them.phrases.includes(p) || (them.text && them.text.includes(spell(p))));
  const top = [...both, ...shared.sort((x, y) => y[1] - x[1]).map(([w]) => w)];
  const words_ = [...new Set(top.map(spell))].filter((w, i, all) => !all.some((o, j) => j < i && o.includes(w)));
  return { score: Math.min(1, cos + 0.12 * both.length), shared: words_.slice(0, 5), phrases: both.length };
}

// --- Reading a page: title, description, headline, and some body text. Private addresses are refused. ---
export async function readPage(url, ms = 7000) {
  let at = url;
  for (let hop = 0; hop <= 4; hop++) {
    await assertPublic(at);
    const r = await fetch(at, { redirect: "manual", headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(ms) });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
      at = new URL(r.headers.get("location"), at).toString();
      r.body?.cancel().catch(() => {});
      continue;
    }
    if (!r.ok || !/html/i.test(r.headers.get("content-type") || "html")) throw new Error(`status ${r.status}`);
    const reader = r.body.getReader();
    const chunks = [];
    let size = 0;
    while (size < 400000) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => {});
    const html = Buffer.concat(chunks).toString("utf8");
    const body = html.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ");
    return {
      url: at,
      title: text(attr(html, /<title[^>]*>([^<]*)<\/title>/i)).slice(0, 160),
      description: text(meta(html, "description") || meta(html, "og:description")).slice(0, 300),
      h1: text((/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(body) || [])[1] || "").slice(0, 200),
      siteName: text(meta(html, "og:site_name")).slice(0, 60),
      body: text(body).slice(0, 6000),
    };
  }
  throw new Error("Too many redirects.");
}

// --- Sources. Each returns [{ url, from }] and never throws. ---
const searchQueries = (me) => {
  const top = [...me.terms.keys()];
  const q1 = me.phrases[0] ? `${me.phrases[0]} ${top.find((w) => !me.phrases[0].includes(w)) || ""}` : top.slice(0, 3).join(" ");
  const q2 = me.phrases[1] || top.slice(1, 4).join(" ");
  return [...new Set([q1.trim(), q2.trim()].filter(Boolean))];
};

async function fromWeb(q, host) {
  const out = [];
  const query = `${q} -site:${host}`;
  try {
    const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(8000) });
    const html = await r.text();
    for (const m of html.matchAll(/class="result__a"[^>]*href="([^"]+)"/g)) {
      const raw = m[1].replace(/&amp;/g, "&");
      const u = /[?&]uddg=([^&]+)/.exec(raw);
      out.push({ url: u ? decodeURIComponent(u[1]) : raw.startsWith("//") ? `https:${raw}` : raw, from: "web" });
    }
    if (!out.length) console.log("Competitor scan: web search gave nothing", r.status, /anomaly|captcha/i.test(html) ? "(blocked)" : "");
  } catch (err) {
    console.log("Competitor scan: web search failed", err.message);
  }
  if (out.length >= 5) return out;
  try {
    const r = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en`, { headers: { "user-agent": UA, accept: "text/html", "accept-language": "en-US,en" }, signal: AbortSignal.timeout(8000) });
    const html = await r.text();
    for (const m of html.matchAll(/<li class="b_algo"[\s\S]*?<h2[^>]*>\s*<a[^>]+href="(https?:\/\/[^"]+)"/g)) out.push({ url: m[1].replace(/&amp;/g, "&"), from: "web" });
    if (!out.length) console.log("Competitor scan: second web search gave nothing", r.status);
  } catch (err) {
    console.log("Competitor scan: second web search failed", err.message);
  }
  return out;
}

async function fromLaunches(q) {
  try {
    const r = await fetch(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=show_hn&hitsPerPage=30`, { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    return (d.hits || []).filter((h) => h.url).map((h) => ({ url: h.url, from: "launch" }));
  } catch (err) {
    console.log("Competitor scan: launches failed", err.message);
    return [];
  }
}

// Pages stamped here, kept as a small word index: every published stamp adds its page (see _publish.js).
export async function notePage(rec) {
  try {
    const entry = { host: bare(rec.host), url: rec.url, text: [rec.title, rec.h1, rec.description, rec.subhead].filter(Boolean).join(" · ").slice(0, 600), at: Date.now() };
    if (!entry.host || !entry.text) return;
    const list = ((await get(PAGES_KEY)) || []).filter((x) => x.host !== entry.host);
    await set(PAGES_KEY, [entry, ...list].slice(0, PAGES_MAX));
  } catch (err) {
    console.error("Page index failed:", err.message);
  }
}
// The first scan fills the index from the newest published stamps, once.
async function backfillPages() {
  if (await get(`${PAGES_KEY}:filled`).catch(() => null)) return;
  await set(`${PAGES_KEY}:filled`, Date.now()).catch(() => {});
  try {
    const { list } = await import("@vercel/blob");
    const page = await list({ prefix: "verdicts/", limit: 1000 });
    const blobs = page.blobs.filter((b) => /^verdicts\/[A-Za-z0-9_-]+\.json$/.test(b.pathname)).sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)).slice(0, 300);
    const entries = [];
    for (let i = 0; i < blobs.length; i += 25) {
      const rows = await Promise.all(blobs.slice(i, i + 25).map(async (b) => {
        const r = await fetch(b.url).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        if (!r?.host || !r.pageUrl) return null;
        const s = r.snapshot || (await get(`snap:${r.id}`).catch(() => null)) || {};
        const t = [s.title, s.content?.h1, s.content?.description, s.content?.subhead].filter(Boolean).join(" · ").slice(0, 600);
        return t ? { host: bare(r.host), url: r.pageUrl, text: t, at: Date.parse(r.createdAt) || 0 } : null;
      }));
      entries.push(...rows.filter(Boolean));
    }
    const have = (await get(PAGES_KEY).catch(() => null)) || [];
    const seen = new Set(have.map((x) => x.host));
    await set(PAGES_KEY, [...have, ...entries.filter((x) => !seen.has(x.host) && seen.add(x.host))].slice(0, PAGES_MAX));
  } catch (err) {
    console.error("Page index backfill failed:", err.message);
  }
}
async function fromStamped(me) {
  await backfillPages();
  const list = (await get(PAGES_KEY).catch(() => null)) || [];
  return list
    .map((x) => ({ x, l: likeness(me, { ...profile({ title: x.text }), text: x.text.toLowerCase() }) }))
    .filter(({ l }) => l.score >= 0.15)
    .sort((a, b) => b.l.score - a.l.score)
    .slice(0, 8)
    .map(({ x }) => ({ url: x.url, from: "stamped" }));
}

// A candidate becomes the site's homepage, unless it's a platform, an article, or the member's own site.
export function clean(cands, skip) {
  const seen = new Map();
  for (const c of cands) {
    let u;
    try { u = new URL(c.url); } catch (_) { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    const host = bare(u.hostname);
    const site = SHARED_HOSTS.test(host) ? host : siteOf(host);
    if (skip.has(site) || IGNORE_HOSTS.test(host) || /^(docs|blog|help|support|status|community|forum|news|dev|developer|developers)\./.test(host)) continue;
    if (c.from !== "stamped" && ARTICLE_PATH.test(u.pathname)) continue;
    // A product's own landing page one level down (unbounce.com/landing-page-analyzer) is kept; anything deeper, or on
    // an app./my. subdomain, becomes the site's homepage.
    const oneLevel = /^\/[a-z0-9-]{3,40}\/?$/i.test(u.pathname) && !/^\/(features?|pricing|plans|signup|sign-up|register|login|signin|about|contact|team|company|customers|integrations|changelog|download|demo|faq|legal|terms|privacy|en|us|uk|de|fr|es|home|index)\/?$/i.test(u.pathname);
    const appHost = /^(app|my|dashboard|account|login|auth|get|go|try)\./.test(host);
    const home = c.from === "stamped" ? u.toString() : appHost ? `https://${site}/` : `${u.protocol}//${u.hostname}${oneLevel ? u.pathname : "/"}`;
    const prev = seen.get(site);
    if (prev) { prev.from.add(c.from); continue; }
    seen.set(site, { url: home, host, site, from: new Set([c.from]) });
  }
  return [...seen.values()];
}

// Where a match came from, as the member sees it. Pages stamped here aren't named as such: who stamped what stays private.
const FROM_LABEL = { stamped: "", launch: "Launched on Hacker News", web: "Web search" };

// The scan. exclude: sites to leave out (the member's own, competitors already added). Cached a day per page.
export async function findCompetitors(pageUrl, { exclude = [] } = {}) {
  const own = new URL(pageUrl);
  const ownSite = siteOf(own.hostname);
  const cacheKey = `comp:${bare(own.hostname)}${own.pathname.replace(/\/$/, "")}`;
  const skip = new Set([ownSite, ...exclude.map((x) => { try { return siteOf(new URL(x).hostname); } catch (_) { return siteOf(x); } })]);
  const cached = await get(cacheKey).catch(() => null);
  if (cached && Date.now() - cached.at < 86400000) return { ...cached, found: cached.found.filter((f) => !skip.has(siteOf(f.host))) };

  const page = await readPage(pageUrl, 10000);
  const brandWords = [page.siteName, ownSite.split(".")[0], (page.title.split(/\s[|\-–—:·]\s/)[0] || "").length < 30 ? page.title.split(/\s[|\-–—:·]\s/)[0] : ""].filter(Boolean);
  const me = profile({ ...page, brand: brandWords });
  if (me.terms.size < 3) return { at: Date.now(), about: [], found: [], note: "Your page says too little in its HTML to match it against others." };
  const qs = searchQueries(me);
  const results = await Promise.all([fromStamped(me), ...qs.map((q) => fromWeb(q, own.hostname)), fromLaunches(me.phrases[0] || [...me.terms.keys()].slice(0, 2).join(" "))]);
  const cands = clean(results.flat(), skip).slice(0, 18);
  console.log("Competitor scan:", own.hostname, "queries", JSON.stringify(qs), "candidates", cands.length, "by source", JSON.stringify(results.map((r) => r.length)));

  const checked = await Promise.all(cands.map(async (c) => {
    try {
      const p = await readPage(c.url, 7000);
      const them = { ...profile(p), text: `${p.title} ${p.description} ${p.h1} ${p.body.slice(0, 3000)}`.toLowerCase() };
      const l = likeness(me, them);
      return { ...c, title: p.title, description: p.description || p.h1, score: l.score + (c.from.size > 1 ? 0.05 : 0), shared: l.shared, phrases: l.phrases };
    } catch (_) {
      return null;
    }
  }));
  const found = checked
    .filter((c) => c && c.title && c.score >= 0.2 && (c.shared.length >= 3 || c.phrases >= 1))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((c) => ({
      url: c.url, host: c.host, title: c.title, description: c.description.slice(0, 160),
      match: Math.round(Math.min(0.99, c.score) * 100), shared: c.shared, from: [...c.from].map((f) => FROM_LABEL[f]).filter(Boolean),
    }));
  const out = { at: Date.now(), about: [...new Set([...me.phrases.slice(0, 2), ...[...me.terms.keys()].slice(0, 4)].map(spell))].slice(0, 5), found };
  await set(cacheKey, out, 86400).catch(() => {});
  return out;
}
