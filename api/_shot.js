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

async function microlink(pageUrl, { phone = false, read = false } = {}) {
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
    adblock: "true",
    styles: CONSENT_CSS,
    ...(read
      ? {
          "data.h1.selector": "h1",
          "data.h1.attr": "text",
          "data.h1.type": "string",
          "data.ctas.selectorAll": CTA_SELECTOR,
          "data.ctas.attr": "text",
          "data.ctas.type": "string",
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
        }
      : {}),
  };
  for (const [k, v] of Object.entries(q)) api.searchParams.set(k, v);
  const r = await fetch(api, { headers: key ? { "x-api-key": key } : {} });
  const data = await r.json().catch(() => ({}));
  const shot = data?.data?.screenshot?.url;
  if (!r.ok || data.status !== "success" || !shot) {
    throw new Error(`Screenshot failed: ${data.message || data.code || `status ${r.status}`}.`);
  }
  const img = await fetch(shot);
  if (!img.ok) throw new Error(`Screenshot download failed: status ${img.status}.`);
  return { jpg: Buffer.from(await img.arrayBuffer()), data: data.data };
}

export async function screenshot(pageUrl, phone = false) {
  return (await microlink(pageUrl, { phone })).jpg;
}

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

// The desktop first screen plus what it says: { jpg, rendered: { h1, ctas, title, description, tags } }.
// rendered is null when the browser couldn't read the page; the rules then fall back to the raw HTML.
export async function capture(pageUrl) {
  const { jpg, data } = await microlink(pageUrl, { read: true });
  const ctas = (Array.isArray(data?.ctas) ? data.ctas : []).map(clean).filter((t) => t && t.length <= 60);
  const h1 = clean(data?.h1).slice(0, 300);
  const title = clean(data?.pageTitle).slice(0, 160);
  const rendered = {
    h1,
    ctas,
    title,
    description: clean(data?.pageDescription).slice(0, 300),
    tags: { "og:title": !!clean(data?.ogTitle), "og:image": !!clean(data?.ogImage), viewport: !!clean(data?.viewport) },
  };
  return { jpg, rendered: h1 || ctas.length || title ? rendered : null };
}
