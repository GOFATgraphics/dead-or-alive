// The stack and speed snapshot that comes free with every stamp: how fast the page's HTML arrives,
// how big it is, where it's hosted, what it's built with, and which share and search tags are missing.
// The server fetches a customer's URL here, so every hop is checked against private networks first.
import dns from "node:dns/promises";
import net from "node:net";
import { checkPageUrl, pageKind } from "../src/url.js";

const MAX_HOPS = 5;
const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 12000;
const UA = "Mozilla/5.0 (compatible; StampMyPage/1.0; +https://stampmypage.com)";


const blocked = new net.BlockList();
for (const [net4, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
]) blocked.addSubnet(net4, bits, "ipv4");
for (const [net6, bits] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["64:ff9b::", 96], ["2001:db8::", 32]]) {
  blocked.addSubnet(net6, bits, "ipv6");
}

function isPrivate(address, family) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return blocked.check(mapped[1], "ipv4");
  return blocked.check(address, family === 6 ? "ipv6" : "ipv4");
}

async function assertPublic(url) {
  const checked = checkPageUrl(url);
  if (!checked.url) throw new Error(checked.error);
  const host = new URL(url).hostname;
  const addrs = await dns.lookup(host, { all: true, verbatim: true });
  if (!addrs.length || addrs.some((a) => isPrivate(a.address, a.family))) throw new Error("That address points to a private network.");
}

// Follows redirects by hand so each new address is checked too.
async function safeFetch(start) {
  let url = start;
  const t0 = Date.now();
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    await assertPublic(url);
    const r = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
      url = new URL(r.headers.get("location"), url).toString();
      continue;
    }
    const firstByteMs = Date.now() - t0;
    const reader = r.body?.getReader();
    const chunks = [];
    let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) {
        reader.cancel().catch(() => {});
        break;
      }
      chunks.push(value);
    }
    return { res: r, finalUrl: url, html: Buffer.concat(chunks).toString("utf8"), bytes: size, firstByteMs, totalMs: Date.now() - t0, hops: hop };
  }
  throw new Error("Too many redirects.");
}

// A small file (an icon) from a public address, following redirects with the same private-network checks.
// Resolves { buf, type }, or throws.
export async function fetchPublicFile(start, maxBytes = 256 * 1024) {
  let url = start;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    await assertPublic(url);
    const r = await fetch(url, { redirect: "manual", headers: { "user-agent": UA, accept: "image/*" }, signal: AbortSignal.timeout(8000) });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
      url = new URL(r.headers.get("location"), url).toString();
      continue;
    }
    if (!r.ok) throw new Error(`status ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > maxBytes) throw new Error("too big");
    return { buf, type: (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() };
  }
  throw new Error("Too many redirects.");
}

function hostOf(h) {
  const get = (k) => (h.get(k) || "").toLowerCase();
  if (get("x-vercel-id") || get("server") === "vercel") return "Vercel";
  if (get("x-nf-request-id") || get("server").includes("netlify")) return "Netlify";
  if (get("x-shopid") || get("x-shopify-stage") || get("powered-by").includes("shopify")) return "Shopify";
  if (get("x-wix-request-id")) return "Wix";
  if (get("x-github-request-id")) return "GitHub Pages";
  if (get("x-render-origin-server") || get("rndr-id")) return "Render";
  if (get("fly-request-id")) return "Fly.io";
  if (get("x-railway-request-id") || get("server").includes("railway")) return "Railway";
  if (get("x-amz-cf-id")) return "AWS CloudFront";
  if (get("cf-ray")) return "Cloudflare";
  if (get("x-served-by").includes("cache-") || get("x-fastly-request-id")) return "Fastly";
  if (get("server").includes("gws") || get("server").includes("google")) return "Google";
  const server = h.get("server");
  return server ? server.split("/")[0] : "";
}

// AI app builders first: they're what a vibe-coded page is "built with", whatever framework sits underneath.
const BUILDERS = [
  ["Lovable", /\.lovable\.app$|\.lovableproject\.com$/i, /gpteng\.co|gptengineer|lovable-tagger|lovable\.dev\/|<meta[^>]+content=["']Lovable/i],
  ["Bolt", /\.bolt\.host$|\.bolt\.new$/i, /made (with|in) bolt|bolt\.new\/|<meta[^>]+content=["']Bolt/i],
  ["v0", /\.vusercontent\.net$|\.v0\.app$/i, /v0\.dev\/|v0\.app\/|<meta[^>]+content=["']v0/i],
  ["Replit", /\.replit\.app$|\.repl\.co$|\.replit\.dev$/i, /replit\.com\/public\/js|replit-badge/i],
  ["Base44", /\.base44\.app$/i, /base44\.com\/|base44-sdk/i],
];
function builtBy(finalUrl, html) {
  let host = "";
  try {
    host = new URL(finalUrl).hostname;
  } catch (_) {}
  return BUILDERS.filter(([, hostRe, htmlRe]) => hostRe.test(host) || htmlRe.test(html.slice(0, 200000))).map(([name]) => name).slice(0, 1);
}

const FRAMEWORKS = [
  ["Framer", /framerusercontent\.com|data-framer-/i],
  ["Webflow", /data-wf-page|webflow\.(js|css)|assets\.website-files\.com/i],
  ["Wix", /static\.wixstatic\.com|wix-thunderbolt/i],
  ["Squarespace", /static1\.squarespace\.com|squarespace-cdn/i],
  ["Shopify", /cdn\.shopify\.com|Shopify\.theme/i],
  ["WordPress", /wp-content\/|wp-includes\//i],
  ["Ghost", /content="Ghost|ghost-portal/i],
  ["Bubble", /bubble\.io|_bubble_page_load/i],
  ["Carrd", /carrd\.co/i],
  ["Next.js", /__NEXT_DATA__|\/_next\/static/i],
  ["Nuxt", /__NUXT__|\/_nuxt\//i],
  ["Gatsby", /___gatsby|gatsby-/i],
  ["Remix", /__remixContext|__reactRouterContext/i],
  ["Astro", /astro-island|\/_astro\//i],
  ["SvelteKit", /__sveltekit|\/_app\/immutable\//i],
  ["Angular", /ng-version=/i],
  ["Vite", /\/assets\/index-[\w-]+\.js|\/@vite\/client/i],
];

function attr(html, re) {
  const m = re.exec(html);
  return m ? m[1].trim() : "";
}
function meta(html, key) {
  const k = key.replace(/[.:]/g, "\\$&");
  return (
    attr(html, new RegExp(`<meta[^>]+(?:name|property)=["']${k}["'][^>]*content=["']([^"']*)["']`, "i")) ||
    attr(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${k}["']`, "i"))
  );
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", mdash: "—", ndash: "–", hellip: "…" };
function text(fragment) {
  return String(fragment || "")
    .replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

// What the raw HTML says: the headline, the button labels, and the description. Pages built in the browser
// may have none of this in their HTML; the rendered capture fills it in then.
// The best icon the page declares: the Apple touch icon (big and square), else the largest sized icon, else any.
export function iconHref(html) {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const attr = (tag, name) => (new RegExp(`\\b${name}=["']([^"']*)["']`, "i").exec(tag) || [])[1] || "";
  let best = null, bestRank = -1;
  for (const tag of links) {
    const rel = attr(tag, "rel").toLowerCase();
    const href = attr(tag, "href");
    if (!href || !/\bicon\b/.test(rel)) continue;
    const size = parseInt((attr(tag, "sizes").match(/(\d+)x\d+/) || [])[1] || "0", 10);
    const rank = (rel.includes("apple-touch-icon") ? 1000 : 0) + Math.min(size, 512) + (/\.svg(\?|$)/i.test(href) ? 0 : 1);
    if (rank > bestRank) (best = href), (bestRank = rank);
  }
  return best;
}

export function content(html, tags) {
  const body = html.replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, " ");
  const h1s = [...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => text(m[1])).filter(Boolean);
  const ctas = [
    ...body.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi),
    ...body.matchAll(/<a\b[^>]*(?:class|role)=["'][^"']*(?:btn|button|cta)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi),
  ]
    .map((m) => text(m[1]))
    .filter((t) => t && t.length <= 60);
  return { h1: (h1s[0] || "").slice(0, 300), h1Count: h1s.length, ctas: ctas.slice(0, 40), description: tags.description.slice(0, 300) };
}

export async function inspect(pageUrl) {
  // App stores serve their own page, so their stack says nothing about the customer's product.
  if (["appstore", "playstore"].includes(pageKind(pageUrl))) return { skipped: "App store page. The store's stack isn't yours, so there's no snapshot." };
  let f;
  try {
    f = await safeFetch(pageUrl);
  } catch (err) {
    return { error: err.name === "TimeoutError" ? "The page took longer than 12 seconds to answer." : `Could not load the page: ${err.message}` };
  }
  const html = f.html;
  const tags = {
    title: attr(html, /<title[^>]*>([^<]*)<\/title>/i),
    description: meta(html, "description"),
    "og:title": meta(html, "og:title"),
    "og:description": meta(html, "og:description"),
    "og:image": meta(html, "og:image"),
    "twitter:card": meta(html, "twitter:card"),
    viewport: meta(html, "viewport"),
    canonical: attr(html, /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i),
    lang: attr(html, /<html[^>]+lang=["']([^"']*)["']/i),
  };
  return {
    status: f.res.status,
    finalUrl: f.finalUrl !== pageUrl ? f.finalUrl : "",
    redirects: f.hops,
    https: f.finalUrl.startsWith("https:"),
    firstByteMs: f.firstByteMs,
    loadMs: f.totalMs,
    htmlKB: Math.round(f.bytes / 102.4) / 10,
    scripts: (html.match(/<script\b/gi) || []).length,
    host: hostOf(f.res.headers),
    built: [...builtBy(f.finalUrl, html), ...FRAMEWORKS.filter(([, re]) => re.test(html)).map(([name]) => name)].slice(0, 3),
    title: tags.title.slice(0, 160),
    missing: Object.entries(tags).filter(([, v]) => !v).map(([k]) => k),
    content: content(html, tags),
    icon: (() => {
      const href = iconHref(html);
      try {
        return href ? new URL(href, f.finalUrl).toString() : "";
      } catch (_) {
        return "";
      }
    })(),
    checkedAt: new Date().toISOString(),
  };
}
