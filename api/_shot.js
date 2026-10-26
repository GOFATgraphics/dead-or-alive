// One first screen, no scrolling. Microlink runs the browser; with a key it uses the paid plan.
// capture() also reads a few things from the rendered page (the headline and button labels), so pages
// that build themselves in JavaScript are judged on what a visitor actually sees, not on empty HTML.
// Env (optional): MICROLINK_API_KEY.

export const VIEWPORT = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844, scale: 2 };

// Cookie and consent banners cover the first screen and say nothing about the offer, so the browser blocks
// ads and trackers (Microlink's adblock) and these known consent tools are hidden before the screenshot.
// Scroll locks they leave on the page are undone too.
const CONSENT = [
  "#onetrust-banner-sdk", "#onetrust-consent-sdk", ".onetrust-pc-dark-filter", "#CybotCookiebotDialog", "#CybotCookiebotDialogBodyUnderlay",
  "#usercentrics-root", "#usercentrics-cmp-ui", ".fc-consent-root", "#didomi-host", ".didomi-popup-backdrop", "#qc-cmp2-container",
  ".qc-cmp2-container", "#truste-consent-track", ".truste_overlay", ".truste_box_overlay", "#cmpbox", "#cmpbox2", "[id^='sp_message_container']",
  ".osano-cm-window", ".termly-styles-root", "#iubenda-cs-banner", ".cky-consent-container", ".cky-overlay", "#cookie-law-info-bar",
  ".cli-modal-backdrop", "#cookie-notice", "#cookiescript_injected", ".cc-window", ".cc-banner", "#hs-eu-cookie-confirmation",
  "#BorlabsCookieBox", ".klaro", ".cookiefirst-root", "#axeptio_overlay", "#tarteaucitronRoot", "#moove_gdpr_cookie_info_bar",
  "#gdpr-cookie-message", ".cookie-banner", "#cookie-banner", ".cookie-consent", "#cookie-consent", ".cookieconsent", "#cookieconsent",
  "[aria-label*='cookie' i][role='dialog']", "[aria-label*='consent' i][role='dialog']",
];
const CONSENT_CSS = `${CONSENT.join(",")}{display:none!important}html,body{overflow:auto!important}`;

// Buttons and button-like links, as a visitor sees them.
const CTA_SELECTOR = 'button, [role="button"], a[class*="btn"], a[class*="button"], a[class*="cta"], input[type="submit"]';

// Runs in the page (public/measure.js, served from this site and passed by address to keep the request short):
// where the headline and buttons sit, the subhead, which tools are running, real browser performance numbers,
// third-party hosts, and fonts in use. It leaves them on <html data-smp>, which a data rule reads back.
// If a site's security policy blocks it, the stamp simply has no circles and fewer stack facts.
const siteBase = () =>
  (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://stampmypage.com")).replace(/\/$/, "");
const MEASURE_URL = () => `${siteBase()}/measure.js`;

// How much to ask for. "full": banner hiding, the measuring script, and the data rules. "safe": the same
// without the script. "bare": just the screenshot and the headline and buttons. capture() steps down
// when a richer request is refused, so an option the screenshot plan doesn't allow costs circles, not the stamp.
const TIERS = ["full", "safe", "bare"];

// A refusal that stepping down won't fix: the plan's rate limit or daily quota. (A feature the plan
// doesn't include is fixed by stepping down, so that isn't "busy".)
export const isBusy = (msg) => /\b(429|ERATE|rate.?limit|too many requests|quota)\b/i.test(String(msg || ""));

async function microlink(pageUrl, { phone = false, read = false, tier = "full" } = {}) {
  const key = process.env.MICROLINK_API_KEY;
  const api = new URL(key ? "https://pro.microlink.io/" : "https://api.microlink.io/");
  const q = {
    url: pageUrl,
    screenshot: "true",
    meta: "false",
    "viewport.width": String(phone ? PHONE.width : VIEWPORT.width),
    "viewport.height": String(phone ? PHONE.height : VIEWPORT.height),
    "viewport.deviceScaleFactor": String(phone ? PHONE.scale : 1),
    "viewport.isMobile": String(phone),
    "viewport.hasTouch": String(phone),
    "screenshot.type": "jpeg",
    waitForTimeout: "1500",
    ...(tier !== "bare" ? { adblock: "true", styles: CONSENT_CSS } : {}),
    ...(read && tier === "full" ? { scripts: MEASURE_URL() } : {}),
    ...(read
      ? {
          "data.h1.selector": "h1",
          "data.h1.attr": "text",
          "data.h1.type": "string",
          "data.ctas.selectorAll": CTA_SELECTOR,
          "data.ctas.attr": "text",
          "data.ctas.type": "string",
        }
      : {}),
    ...(read && tier !== "bare"
      ? {
          // What the page says about itself, for when our own request is blocked.
          "data.pageTitle.selector": "title",
          "data.pageTitle.attr": "text",
          "data.pageTitle.type": "string",
          "data.pageDescription.selector": "meta[name='description']",
          "data.pageDescription.attr": "content",
          "data.pageDescription.type": "string",
          "data.ogTitle.selector": "meta[property='og:title']",
          "data.ogTitle.attr": "content",
          "data.ogImage.selector": "meta[property='og:image']",
          "data.ogImage.attr": "content",
          "data.viewport.selector": "meta[name='viewport']",
          "data.viewport.attr": "content",
          "data.iconHref.selector": "link[rel~='icon'], link[rel='apple-touch-icon'], link[rel='shortcut icon']",
          "data.iconHref.attr": "href",
          "data.subhead.selector": "h1 ~ p",
          "data.subhead.attr": "text",
          "data.subhead.type": "string",
          "data.scriptSrcs.selectorAll": "script[src]",
          "data.scriptSrcs.attr": "src",
        }
      : {}),
    ...(read && tier === "full" ? { "data.layout.selector": "html", "data.layout.attr": "data-smp" } : {}),
  };
  for (const [k, v] of Object.entries(q)) api.searchParams.set(k, v);
  const r = await fetch(api, { headers: key ? { "x-api-key": key } : {} });
  const data = await r.json().catch(() => ({}));
  const shot = data?.data?.screenshot?.url;
  if (!r.ok || data.status !== "success" || !shot) {
    throw new Error(`Screenshot failed (${tier}): ${data.code ? `${data.code} ` : ""}${data.message || `status ${r.status}`}.`.replace(/\s+\./, "."));
  }
  const img = await fetch(shot);
  if (!img.ok) throw new Error(`Screenshot download failed: status ${img.status}.`);
  return { jpg: Buffer.from(await img.arrayBuffer()), data: data.data };
}

export async function screenshot(pageUrl, phone = false) {
  return (await microlink(pageUrl, { phone })).jpg;
}

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

// What measure.js left on the page, checked and trimmed: { w, h, head, buttons, sub, globals, frameworks,
// perf, fonts, scripts } (boxes in CSS pixels of the viewport), or null.
const strs = (a, n, len = 160) => (Array.isArray(a) ? a.filter((x) => typeof x === "string" && x).map((x) => x.slice(0, len)).slice(0, n) : []);
const num = (x) => (Number.isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : null);
function parseLayout(raw) {
  try {
    const l = JSON.parse(String(raw || ""));
    const ok = (b) => Array.isArray(b) && b.slice(0, 4).every((n) => Number.isFinite(n));
    if (!(l?.w > 0 && l?.h > 0)) return null;
    const p = l.perf && typeof l.perf === "object" ? l.perf : null;
    return {
      w: l.w,
      h: l.h,
      head: ok(l.head) ? l.head.slice(0, 4) : null,
      buttons: (Array.isArray(l.buttons) ? l.buttons : []).filter(ok).slice(0, 16),
      sub: typeof l.sub === "string" ? l.sub.slice(0, 320) : "",
      globals: strs(l.g, 80, 40),
      frameworks: strs(l.fw, 10, 20),
      perf: p
        ? {
            ttfb: num(p.ttfb), dcl: num(p.dcl), load: num(p.load), lcp: num(p.lcp), cls: num(p.cls), requests: num(p.requests),
            kb: Object.fromEntries(Object.entries(p.kb || {}).map(([k, v]) => [k, num(v)]).filter(([k]) => ["html", "js", "css", "img", "font", "other"].includes(k))),
            third: strs(p.third, 60, 80),
            res: strs(p.res, 120, 140),
          }
        : null,
      fonts: strs(l.fonts, 12, 60),
      scripts: strs(l.scripts, 60),
    };
  } catch (_) {
    return null;
  }
}

// The desktop first screen plus what it says: { jpg, rendered: { h1, ctas, title, description, tags } }.
// rendered is null when the browser couldn't read the page; the rules then fall back to the raw HTML.
export async function capture(pageUrl) {
  let jpg, data, last;
  for (const tier of TIERS) {
    try {
      ({ jpg, data } = await microlink(pageUrl, { read: true, tier }));
      if (tier !== "full") console.warn(`Capture fell back to "${tier}" after: ${last?.message}`);
      break;
    } catch (err) {
      last = err;
      console.error(err.message);
      if (isBusy(err.message)) throw err;
    }
  }
  if (!jpg) throw last;
  const ctas = (Array.isArray(data?.ctas) ? data.ctas : []).map(clean).filter((t) => t && t.length <= 60);
  const h1 = clean(data?.h1).slice(0, 300);
  const title = clean(data?.pageTitle).slice(0, 160);
  const rendered = {
    h1,
    ctas,
    title,
    description: clean(data?.pageDescription).slice(0, 300),
    subhead: clean(data?.subhead).slice(0, 320),
    scriptSrcs: strs(data?.scriptSrcs, 60),
    tags: { "og:title": !!clean(data?.ogTitle), "og:image": !!clean(data?.ogImage), viewport: !!clean(data?.viewport) },
    layout: parseLayout(data?.layout),
    icon: (() => {
      try {
        return data?.iconHref ? new URL(clean(data.iconHref), pageUrl).toString() : "";
      } catch (_) {
        return "";
      }
    })(),
  };
  return { jpg, rendered: h1 || ctas.length || title ? rendered : null };
}
