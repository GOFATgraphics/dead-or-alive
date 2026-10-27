// The pricing cards as HTML, from PLANS in config.js: one source for the homepage, /pricing, and the result page,
// so every card says exactly what checkout sells. Used at build time (vite.config.js) and in the browser.
import { PLANS } from "./config.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const CHECK = '<svg class="ic" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

export const point = (p) => {
  const m = /^Instant: (.*)$/.exec(p);
  return m ? { instant: true, text: m[1] } : { instant: false, text: p };
};

export const planHref = (key, pageUrl = "", billing = "") => `/dashboard?plan=${key}${billing === "yearly" ? "&billing=yearly" : ""}${pageUrl ? `&url=${encodeURIComponent(pageUrl)}` : ""}`;

// Plain feature text: the "Instant:" marker becomes a note under the button instead of a tag on every line.
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const NOTE = {
  free: "No account needed.",
  killSheet: "In your dashboard the moment you pay.",
  stayAlive: "Starts the moment you subscribe. Cancel anytime.",
};
const FREE = {
  name: "Free",
  price: "$0",
  per: "forever",
  sub: "No card, no account needed",
  audience: "Solo founders and hobbyists",
  points: [
    "Your stamp in about a minute: DEAD, COPE or ALIVE",
    "13 first-screen checks and a score out of 100",
    "A shareable stamp card, and a footer badge for ALIVE",
    "With a free account: every check, the stack, speed, and SEO, saved",
  ],
  limits: ["No full-page scout", "No copy rewrites", "No monitoring", "Re-stamp by hand"],
  cta: "Stamp my page",
};

// One card: who it's for, the price (and the yearly price where there is one), what's in, what's not, then the button.
function card({ key, name, audience, price, per, sub, yearly, points, limits, cta, href, yearlyHref, featured }) {
  const list = points.map((t) => `<li>${CHECK}<span>${esc(t)}</span></li>`).join("");
  const nots = (limits || []).map((t) => `<li>${esc(t)}</li>`).join("");
  const under = yearly
    ? `<p class="pc-sub">or <a href="${yearlyHref}" data-plan="${key}" data-billing="yearly">${esc(yearly.price)} ${esc(yearly.per)}</a> <b>${esc(yearly.save)}</b></p>`
    : `<p class="pc-sub">${esc(sub)}</p>`;
  return `<article class="pc${featured ? " pc-main" : ""}">
  ${featured ? '<span class="pc-flag">Recommended</span>' : ""}
  <h3>${esc(name)}</h3>
  <p class="pc-amount"><b>${esc(price)}</b><span>${esc(per)}</span></p>
  ${under}
  <p class="pc-for">${esc(audience)}</p>
  <ul class="pc-list">${list}</ul>
  ${nots ? `<ul class="pc-nots" aria-label="Not included">${nots}</ul>` : ""}
  <div class="pc-foot">
    <a class="btn ${featured ? "btn-dark" : "btn-line"}" href="${href}"${key !== "free" ? ` data-plan="${key}"` : ""}>${esc(cta)}</a>
    <p class="pc-note">${esc(NOTE[key])}</p>
  </div>
</article>`;
}

const paid = (key, pageUrl, featured) => {
  const p = PLANS[key];
  return card({ key, ...p, points: p.points.map((x) => cap(point(x).text)), href: planHref(key, pageUrl), yearlyHref: planHref(key, pageUrl, "yearly"), featured });
};

// order: which paid plan comes first (and is recommended). pageUrl: carried to checkout from a result page.
export function plansHtml({ free = false, order = ["killSheet", "stayAlive"], pageUrl = "" } = {}) {
  const cards = [
    free ? card({ key: "free", ...FREE, href: "/#top" }) : "",
    paid(order[0], pageUrl, true),
    paid(order[1], pageUrl, false),
  ].join("");
  return `<div class="pc-grid${free ? " three" : ""}">${cards}</div>
<p class="pc-how">Paid plans start with a free account. Check out with the same email and your dashboard opens with everything already running. Payments are handled by our payment provider; we never see your card.</p>`;
}

// How the app review works, in the same words everywhere it's sold.
export const REVIEW_STEPS = [
  "The automated stamp comes first: instant, first screen, 13 checks.",
  "As a member, you submit in your dashboard: your site or app link, what to test, and a test-only account if a login is needed.",
  "We test it end to end: the logged-out first screen, signup and onboarding, and the core flow, back to back.",
  "The result comes back in your dashboard: problems found, fixes ranked, and rewritten copy, with a status you can see: Received, In review, Delivered.",
  "The test account is deleted after the review. You can revoke it at any time before that.",
];

export function reviewHtml() {
  return `<section class="pc-review" aria-label="App review">
  <div>
    <h3>App review, included</h3>
    <p>One with the Kill Sheet, one a month with Stay Alive. A person tests your app end to end and the result lands in your dashboard.</p>
  </div>
  <ol>${REVIEW_STEPS.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
</section>`;
}
