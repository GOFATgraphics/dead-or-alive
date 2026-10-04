// The homepage is plain HTML. This adds the form, the queue check, and Box in the footer.
import { DESK } from "./config.js";
import { Box } from "./mascot.js";
import { KIND_HINT, checkPageUrl, pageKind } from "./url.js";
import { track, trackView } from "./track.js";

const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

trackView("home");

// Queue: closed by hand in src/config.js, or automatically when too many paid pages are waiting.

let closed = false;
const ctaBox = $("#cta-box");
Box.mount(ctaBox, { state: "idle" });

function closeQueue() {
  if (closed) return;
  closed = true;
  track("queue_closed");
  $("#judge-form").hidden = true;
  $("#queue-closed").hidden = false;
  $("#trust-line").hidden = true;
  Box.mount(ctaBox, { state: "closed" });
  $$("[data-focus-form]").forEach((a) => (a.textContent = "Paused for a moment"));
}

async function queueOpen() {
  if (!DESK.queueOpen) return false;
  try {
    const r = await fetch("/api/queue", { headers: { Accept: "application/json" } });
    if (!r.ok) return true;
    return (await r.json()).open !== false;
  } catch (_) {
    return true;
  }
}

if (!DESK.queueOpen) closeQueue();
else queueOpen().then((open) => open || closeQueue());

// Form

const form = $("#judge-form");
const alertEl = $("#form-alert");
function fail(message, field, code = "other") {
  track("submit_error", { err: code });
  alertEl.hidden = false;
  alertEl.textContent = message;
  if (field) {
    field.setAttribute("aria-invalid", "true");
    field.focus();
  }
}
// Under the URL field: what we'll stamp for this link (a page, an App Store or Google Play listing).
const hintEl = $("#url-hint");
function showHint() {
  const page = checkPageUrl($("#page_url").value);
  hintEl.hidden = !page.url;
  if (!page.url) return;
  const kind = pageKind(page.url);
  hintEl.textContent = KIND_HINT[kind];
  hintEl.dataset.kind = kind;
}
form.addEventListener("input", (e) => {
  e.target.removeAttribute("aria-invalid");
  if (e.target.id === "page_url") showHint();
});
let started = false;
form.addEventListener("focusin", () => {
  if (!started) {
    started = true;
    track("form_start");
  }
});
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  alertEl.hidden = true;
  track("submit_try");
  const urlField = $("#page_url");
  const emailField = $("#email");
  const page = checkPageUrl(urlField.value);
  if (!page.url) return fail(page.error, urlField, page.code);
  if (pageKind(page.url) === "download") return fail(KIND_HINT.download, urlField, "download");
  const email = emailField.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail("That is not an email.", emailField, "email");
  // Check once more, so nobody pays for a slot that filled up while they typed.
  if (!(await queueOpen())) return closeQueue();
  const base = (DESK.polarVerdictUrl || "").trim();
  if (!base) return fail("The Polar checkout link is not connected yet.", null, "no_checkout_link");
  const dest = new URL(base);
  dest.searchParams.set("customer_email", email);
  dest.searchParams.set("custom_field_data.page_url", page.url);
  track("checkout");
  location.assign(dest.toString());
});

// Buttons that jump to the form land the cursor in the URL field, after the scroll finishes.
function focusForm({ smooth = !still } = {}) {
  const input = $("#page_url");
  const box = $("#hero-form");
  if (closed || !input) return;
  const land = () => {
    input.focus({ preventScroll: true });
    box.classList.remove("flash");
    void box.offsetWidth;
    box.classList.add("flash");
  };
  if (!smooth || scrollY < 4) {
    window.scrollTo({ top: 0 });
    return land();
  }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.removeEventListener("scrollend", finish);
    land();
  };
  window.addEventListener("scrollend", finish);
  setTimeout(finish, 1200); // browsers without scrollend
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$$("[data-focus-form]").forEach((a) =>
  a.addEventListener("click", (e) => {
    if (closed) return;
    e.preventDefault();
    track("cta_click");
    history.replaceState(null, "", "#top");
    focusForm();
  })
);
// Arriving from another page at /#top lands in the form too.
if (location.hash === "#top") requestAnimationFrame(() => focusForm({ smooth: false }));
