// One first screen, no scrolling. Microlink runs the browser; with a key it uses the paid plan.
// capture() also reads a few things from the rendered page (the headline and button labels), so pages
// that build themselves in JavaScript are judged on what a visitor actually sees, not on empty HTML.
// Env (optional): MICROLINK_API_KEY.

export const VIEWPORT = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844, scale: 2 };

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

// The desktop first screen plus what it says: { jpg, rendered: { h1, ctas } }.
// rendered is null when the browser couldn't read the page; the rules then fall back to the raw HTML.
export async function capture(pageUrl) {
  const { jpg, data } = await microlink(pageUrl, { read: true });
  const ctas = (Array.isArray(data?.ctas) ? data.ctas : []).map(clean).filter((t) => t && t.length <= 60);
  const h1 = clean(data?.h1).slice(0, 300);
  return { jpg, rendered: h1 || ctas.length ? { h1, ctas } : null };
}
