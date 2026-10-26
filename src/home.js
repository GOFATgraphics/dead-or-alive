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
  const label = button.innerHTML;
  button.disabled = true;
  // The server checks the link is real and answering before it starts; say so while it does.
  button.textContent = "Checking the link…";
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
    button.innerHTML = label;
  }
});

const FAIL_TEXT = {
  busy: "Our screenshot service is at its limit right now. Give it a minute and try again; this one didn't count.",
  unreachable: "We couldn't reach this page: it timed out or answered with an error. Check it loads for a logged-out visitor, then try again.",
  other: "We couldn't stamp this one. It didn't load for us, showed a login wall, or came up blank. Try again in a moment, or try a page a logged-out stranger can see.",
};

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

  // The job id proves this browser made the stamp, so a free account can save it later (see /dashboard).
  const rememberJob = (j) => {
    try {
      const jobs = JSON.parse(localStorage.getItem("smp.jobs") || "[]").filter((x) => x !== j);
      localStorage.setItem("smp.jobs", JSON.stringify([j, ...jobs].slice(0, 50)));
    } catch (_) {}
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
        rememberJob(job);
        location.assign(body.url);
        return;
      }
      if (body.state === "failed") {
        return failed(FAIL_TEXT[body.reason] || FAIL_TEXT.other);
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

// Latest stamps: real ALIVE and COPE stamps (never DEAD) for the hero's floating card (newest 3) and the
// carousel under the URL box (up to 12). Until there are some, both keep their sample rows.

// The site's icon when we have it; the letter tile stays if it's missing or fails to load.
function iconTile(s, className, size) {
  const v = String(s.verdict).toLowerCase();
  const tile = document.createElement("span");
  tile.className = `${className} ${v === "alive" ? "green" : "amber"}`;
  tile.textContent = (s.host || "?").charAt(0).toUpperCase();
  if (s.icon) {
    const img = new Image(size, size);
    img.alt = "";
    img.decoding = "async";
    img.onload = () => {
      tile.className = `${className} ${className === "dot-tile" ? "icon" : "img"}`;
      tile.replaceChildren(img);
    };
    img.src = s.icon;
  }
  return tile;
}

function cardRow(s) {
  const v = String(s.verdict).toLowerCase();
  const li = document.createElement("li");
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
  li.append(iconTile(s, "dot-tile", 24), name, bar, tag);
  return li;
}

function chip(s) {
  const v = String(s.verdict).toLowerCase();
  const li = document.createElement("li");
  li.className = "mq-item";
  const host = document.createElement("span");
  host.className = "mq-host";
  host.textContent = s.host;
  const tag = document.createElement("span");
  tag.className = `mq-v ${v}`;
  tag.textContent = s.verdict;
  li.append(iconTile(s, "mq-icon", 26), host, tag);
  if (Number.isFinite(Number(s.score)) && s.score !== null) {
    const score = document.createElement("span");
    score.className = "mq-score";
    score.textContent = String(s.score);
    li.append(score);
  }
  return li;
}

// Doubles the chips so the loop is seamless (the copies are hidden from screen readers), and paces the speed.
function loopTrack() {
  const track = $("#mq-track");
  if (!track) return;
  [...track.querySelectorAll("[data-clone]")].forEach((n) => n.remove());
  const items = [...track.children];
  // Short lists repeat until the strip is wide enough to loop without a gap.
  let copies = items.length < 6 ? Math.ceil(6 / Math.max(1, items.length)) : 1;
  const extra = [];
  for (let i = 1; i < copies; i++) extra.push(...items.map((n) => n.cloneNode(true)));
  extra.forEach((n) => n.setAttribute("aria-hidden", "true"));
  track.append(...extra);
  const half = [...track.children];
  half.forEach((n) => {
    const c = n.cloneNode(true);
    c.dataset.clone = "";
    c.setAttribute("aria-hidden", "true");
    track.append(c);
  });
  track.style.setProperty("--mq-dur", `${Math.max(20, half.length * 4.5)}s`);
}

loopTrack();

(async () => {
  try {
    const r = await fetch("/api/status?recent=12", { headers: { Accept: "application/json" } });
    const { stamps } = r.ok ? await r.json() : {};
    if (!Array.isArray(stamps) || !stamps.length) return;
    $("#recent-rows").replaceChildren(...stamps.slice(0, 3).map(cardRow));
    $("#recent-tag").textContent = "live";
    $("#recent-dot").hidden = false;
    $("#mq-track").replaceChildren(...stamps.map(chip));
    $("#mq-title").textContent = "Latest stamps";
    $("#mq-dot").hidden = false;
    loopTrack();
  } catch (_) {}
})();
