// The pricing cards as HTML, from PLANS in config.js: one source for the homepage, /pricing, and the result page,
// so every card says exactly what checkout sells. Used at build time (vite.config.js) and in the browser.
import { PLANS } from "./config.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const CHECK = '<svg class="ic" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const ARROW = '<svg class="ic" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';

export const point = (p) => {
  const m = /^Instant: (.*)$/.exec(p);
  return m ? { instant: true, text: m[1] } : { instant: false, text: p };
};

export const planHref = (key, pageUrl = "") => `/dashboard?plan=${key}${pageUrl ? `&url=${encodeURIComponent(pageUrl)}` : ""}`;

function card(key, { main = false } = {}) {
  const p = PLANS[key];
  const ticks = p.points
    .map(point)
    .map((x) => `<li>${CHECK}<span>${x.instant ? '<b class="pc-tag">Instant</b> ' : ""}${esc(x.text)}</span></li>`)
    .join("");
  return `<article class="pc${main ? " pc-main" : ""}">
  <p class="pc-label">${key === "stayAlive" ? "Membership" : "One-time"}</p>
  <h3>${esc(p.name)}</h3>
  <p class="pc-amount">${esc(p.price)} <span>${esc(p.per)}</span></p>
  <p class="pc-pitch">${esc(p.pitch)}</p>
  <ul class="pc-ticks">${ticks}</ul>
  <a class="btn ${main ? "btn-red" : "btn-dark"}" href="${planHref(key)}" data-plan="${key}">${esc(p.cta)} ${ARROW}</a>
</article>`;
}

const FREE = `<article class="pc pc-free">
  <p class="pc-label">Always</p>
  <h3>Free stamp</h3>
  <p class="pc-amount">$0 <span>no signup</span></p>
  <p class="pc-pitch">Paste a URL, get DEAD, COPE or ALIVE in about a minute.</p>
  <ul class="pc-ticks"><li>${CHECK}<span>Your stamp, score, and the one problem that matters most, with its fix</span></li><li>${CHECK}<span>A shareable card and, for ALIVE, a footer badge</span></li><li>${CHECK}<span>With a free account: all 13 checks, the full tech stack, speed, and SEO details</span></li><li>${CHECK}<span>Every stamp saved in one place, and a free re-stamp after you fix it</span></li></ul>
  <a class="btn btn-line" href="/#top">Stamp my page free ${ARROW}</a>
</article>`;

export function plansHtml({ free = false } = {}) {
  return `<div class="pc-grid${free ? " three" : ""}">${free ? FREE : ""}${card("killSheet", { main: true })}${card("stayAlive")}</div>
<ol class="pc-steps" aria-label="How buying works">
  <li><b>1</b><span>Create a free account with your email.</span></li>
  <li><b>2</b><span>Check out with the same email. One-time or monthly, no surprises.</span></li>
  <li><b>3</b><span>Your dashboard opens with everything marked Instant already running.</span></li>
</ol>`;
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
  return `<div class="pc-review">
  <h3>App review, included with both plans</h3>
  <p>The Kill Sheet includes one. Stay Alive includes one every month. It's part of your membership, tracked in your dashboard, not something we email you later.</p>
  <ol>${REVIEW_STEPS.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
</div>`;
}
