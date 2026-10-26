// The homepage is plain HTML. This adds the form: it starts a free stamp, shows it running, and opens it when done.
import { DESK } from "./config.js";
import { KIND_HINT, checkPageUrl, pageKind } from "./url.js";
import { track, trackView } from "./track.js";

const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const POLL_MS = 3000;
const GIVE_UP_MS = 5 * 60 * 1000;
const EXPECTED_S = 60;

trackView("home");

// Paused by hand in src/config.js.

let closed = false;

function closeQueue() {
  if (closed) return;
  closed = true;
  track("queue_closed");
  $("#judge-form").hidden = true;
  $("#queue-closed").hidden = false;
  $("#trust-line").hidden = true;
  $$("[data-focus-form]").forEach((a) => {
    a.textContent = "Resting for a moment";
    a.classList.add("is-paused");
  });
}

if (!DESK.queueOpen) closeQueue();

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

// The owner skips the daily limit: /admin keeps its key in this tab's session storage.
function ownerHeader() {
  try {
    const key = sessionStorage.getItem("doa.key");
    return key ? { "x-admin-key": key } : {};
  } catch (_) {
    return {};
  }
}

let busy = false;
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;
  alertEl.hidden = true;
  track("submit_try");
  const urlField = $("#page_url");
  const page = checkPageUrl(urlField.value);
  if (!page.url) return fail(page.error, urlField, page.code);
  const kind = pageKind(page.url);
  if (["download", "appstore", "playstore"].includes(kind)) return fail(KIND_HINT[kind], urlField, kind);

  busy = true;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const r = await fetch("/api/stamp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...ownerHeader() },
      body: JSON.stringify({ page_url: page.url }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body.job) return fail(body.error || "The stamp jammed. Try again in a moment.", r.status === 400 ? urlField : null, body.code || `http_${r.status}`);
    track("stamp_start");
    // Kept in the URL so a reload picks the same stamp back up.
    history.replaceState(null, "", `?job=${encodeURIComponent(body.job)}&page=${encodeURIComponent(page.url)}#top`);
    watch(body.job, page.url);
  } catch (_) {
    fail("We couldn't reach the stamp. Check your connection and try again.", null, "network");
  } finally {
    busy = false;
    button.disabled = false;
  }
});

// The run: steps tick over on a timer (the real work isn't reported step by step), and the stamp opens when ready.

const run = $("#run");
function hostOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch (_) {
    return u;
  }
}

function watch(job, pageUrl) {
  form.hidden = true;
  $("#trust-line").hidden = true;
  run.hidden = false;
  run.classList.remove("failed", "done");
  $("#run-host").textContent = hostOf(pageUrl);
  $("#run-again").hidden = true;
  $("#run-label").textContent = "Stamping";
  $("#run-note").textContent = "Stay here. Your stamp opens on this page.";
  const steps = $$("#run-steps li");
  const t0 = Date.now();
  let timer, poll;

  const tick = () => {
    const s = Math.floor((Date.now() - t0) / 1000);
    $("#run-time").textContent = `${s}s`;
    // Eases toward 95% so the bar never claims to be done before the stamp is.
    $("#run-bar").style.width = `${Math.min(95, (1 - Math.exp(-s / (EXPECTED_S * 0.6))) * 100)}%`;
    let current = 0;
    steps.forEach((li, i) => {
      if (s >= Number(li.dataset.at)) current = i;
    });
    steps.forEach((li, i) => {
      li.classList.toggle("done", i < current);
      li.classList.toggle("now", i === current);
    });
    if (s > 90) $("#run-note").textContent = "Taking longer than usual. Some pages are slow to load. Still on it.";
  };
  const stop = () => {
    clearInterval(timer);
    clearTimeout(poll);
  };
  const failed = (note) => {
    stop();
    run.classList.add("failed");
    $("#run-label").textContent = "Couldn't stamp";
    steps.forEach((li) => li.classList.remove("now"));
    $("#run-note").textContent = note;
    $("#run-again").hidden = false;
    history.replaceState(null, "", location.pathname + "#top");
  };

  const check = async () => {
    try {
      const r = await fetch(`/api/status?job=${encodeURIComponent(job)}`, { cache: "no-store" });
      const body = r.ok ? await r.json() : {};
      if (body.state === "ready" && body.url) {
        stop();
        run.classList.add("done");
        $("#run-label").textContent = "Stamped";
        steps.forEach((li) => {
          li.classList.remove("now");
          li.classList.add("done");
        });
        $("#run-bar").style.width = "100%";
        $("#run-note").textContent = "Stamped. Opening it now.";
        location.assign(body.url);
        return;
      }
      if (body.state === "failed") {
        return failed("We couldn't stamp this one. It didn't load for us, showed a login or cookie wall, or came up blank. Try a page a logged-out stranger can see.");
      }
    } catch (_) {}
    if (Date.now() - t0 > GIVE_UP_MS) return failed("This one is stuck. Try again, or try another page.");
    poll = setTimeout(check, POLL_MS);
  };

  tick();
  timer = setInterval(tick, 1000);
  poll = setTimeout(check, POLL_MS);
}

$("#run-again").addEventListener("click", () => {
  run.hidden = true;
  form.hidden = false;
  $("#trust-line").hidden = false;
  const input = $("#page_url");
  input.select();
  input.focus();
});

// Arriving with ?job= (a reload mid-stamp) picks the run back up.
{
  const q = new URLSearchParams(location.search);
  const job = q.get("job");
  if (job && /^[0-9a-f-]{36}$/i.test(job) && !closed) {
    $("#page_url").value = q.get("page") || "";
    watch(job, q.get("page") || "your page");
  }
}

// Buttons that jump to the form land the cursor in the URL field, after the scroll finishes.
function focusForm({ smooth = !still } = {}) {
  const input = $("#page_url");
  const box = $("#hero-form");
  if (closed || !input || form.hidden) return;
  const land = () => {
    input.focus({ preventScroll: true });
    box.classList.remove("flash");
    void box.offsetWidth;
    box.classList.add("flash");
  };
  const top = Math.max(0, box.getBoundingClientRect().top + scrollY - 160);
  if (!smooth || Math.abs(scrollY - top) < 4) {
    window.scrollTo({ top });
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
  window.scrollTo({ top, behavior: "smooth" });
}
$$("[data-focus-form]").forEach((a) =>
  a.addEventListener("click", (e) => {
    if (closed) return;
    e.preventDefault();
    track("cta_click");
    history.replaceState(null, "", location.search + "#top");
    focusForm();
  })
);
// Arriving from another page at /#top lands in the form too.
if (location.hash === "#top" && !location.search) requestAnimationFrame(() => focusForm({ smooth: false }));

// The hero's "Latest stamps" card: real ALIVE and COPE stamps when there are any (never DEAD), else the sample.
(async () => {
  try {
    const r = await fetch("/api/recent", { headers: { Accept: "application/json" } });
    const { stamps } = r.ok ? await r.json() : {};
    if (!Array.isArray(stamps) || !stamps.length) return;
    const ul = $("#recent-rows");
    ul.replaceChildren(
      ...stamps.map((s) => {
        const v = String(s.verdict).toLowerCase();
        const li = document.createElement("li");
        const tile = document.createElement("span");
        tile.className = `dot-tile ${v === "alive" ? "green" : "amber"}`;
        tile.textContent = (s.host || "?").charAt(0).toUpperCase();
        const name = document.createElement("span");
        name.className = "row-name";
        name.textContent = s.host;
        const bar = document.createElement("span");
        bar.className = "row-bar";
        const fill = document.createElement("i");
        fill.className = v;
        fill.style.width = `${Math.max(4, Math.min(100, Number(s.score) || (v === "alive" ? 85 : 65)))}%`;
        bar.append(fill);
        const tag = document.createElement("b");
        tag.className = `v-${v}`;
        tag.textContent = s.verdict;
        li.append(tile, name, bar, tag);
        return li;
      })
    );
    $("#recent-tag").textContent = "live";
    $("#recent-dot").hidden = false;
  } catch (_) {}
})();
