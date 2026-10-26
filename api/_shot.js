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

// Runs in the page: measures where the headline's text and the visible buttons sit on the first screen and
// leaves it on <html data-smp>, which the data rules then read. Measured a few times, for pages that build late.
// If a site's security policy blocks injected scripts, there are simply no circles.
const MEASURE = `(function(){var S=${JSON.stringify(CTA_SELECTOR)};function box(b,W,H){if(!b||!b.width||!b.height||b.bottom<0||b.top>H||b.right<0||b.left>W)return null;return[Math.round(b.left),Math.round(b.top),Math.round(b.width),Math.round(b.height)]}function go(){try{var W=innerWidth,H=innerHeight,h=document.querySelector("h1"),hb=null;if(h){var r=document.createRange();r.selectNodeContents(h);hb=box(r.getBoundingClientRect(),W,H)||box(h.getBoundingClientRect(),W,H)}var bs=[].slice.call(document.querySelectorAll(S)).map(function(e){var t=(e.innerText||e.value||"").trim();var b=box(e.getBoundingClientRect(),W,H);return b&&t&&t.length<=60?b.concat([t]):null}).filter(Boolean).slice(0,16);document.documentElement.setAttribute("data-smp",JSON.stringify({w:W,h:H,head:hb,buttons:bs}))}catch(e){}}go();setTimeout(go,500);setTimeout(go,1200)})();`;

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
    ...(read && tier === "full" ? { scripts: MEASURE } : {}),
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

// { w, h, head: [x, y, w, h] | null, buttons: [[x, y, w, h, label]] } in CSS pixels of the viewport, or null.
function parseLayout(raw) {
  try {
    const l = JSON.parse(String(raw || ""));
    const ok = (b) => Array.isArray(b) && b.slice(0, 4).every((n) => Number.isFinite(n));
    if (!(l?.w > 0 && l?.h > 0)) return null;
    return { w: l.w, h: l.h, head: ok(l.head) ? l.head.slice(0, 4) : null, buttons: (Array.isArray(l.buttons) ? l.buttons : []).filter(ok).slice(0, 16) };
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
