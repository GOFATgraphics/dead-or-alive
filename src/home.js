// The homepage is plain HTML. This adds the form, Box, and the small animations.
// Decrypt, magnet, and spark are lightweight ports of the React Bits effects (reactbits.dev).
import { DESK } from "./config.js";
import { Box } from "./mascot.js";
import { createStage } from "./roam.js";
import { KIND_HINT, checkPageUrl, pageKind } from "./url.js";
import { track, trackView } from "./track.js";

const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(pointer: fine)").matches;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
if (!still) document.documentElement.classList.add("motion");

trackView("home");

// Queue: closed by hand in src/config.js, or automatically when too many paid pages are waiting.

let closed = false;
const stage = createStage($("#stage"));
const ctaBox = $("#cta-box");
Box.mount(ctaBox, { state: "idle" });

function closeQueue() {
  if (closed) return;
  closed = true;
  track("queue_closed");
  $("#judge-form").hidden = true;
  $("#queue-closed").hidden = false;
  $("#post-line").hidden = true;
  $("#trust-line").hidden = true;
  stage.stop();
  createStage($("#stage"), { closed: true });
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
else {
  stage.start();
  queueOpen().then((open) => open || closeQueue());
}

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
  stage.home();
  stage.look();
});
let started = false;
form.addEventListener("focusin", () => {
  stage.home();
  if (!started) {
    started = true;
    track("form_start");
  }
});
form.addEventListener("focusout", (e) => {
  if (!form.contains(e.relatedTarget)) stage.resume(6000);
});
form.addEventListener("pointerover", (e) => {
  if (e.target.closest(".submit")) stage.home();
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

// Hero cards follow the pointer a little, each at its own depth.
const frame = $(".hero-frame");
if (!still && finePointer) {
  frame.addEventListener("pointermove", (e) => {
    const r = frame.getBoundingClientRect();
    frame.style.setProperty("--mx", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    frame.style.setProperty("--my", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  });
  frame.addEventListener("pointerleave", () => {
    frame.style.setProperty("--mx", 0);
    frame.style.setProperty("--my", 0);
  });
}

// Stamp words decrypt once when they come into view. The real word is in the HTML from the start.
function decrypt(el) {
  const word = el.textContent;
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  el.setAttribute("aria-label", word);
  let tick = 0;
  const timer = setInterval(() => {
    tick++;
    const done = Math.floor(tick / 2);
    el.textContent = [...word].map((ch, i) => (i < done ? ch : letters[(Math.random() * 26) | 0])).join("");
    if (done >= word.length) {
      clearInterval(timer);
      el.textContent = word;
    }
  }, 55);
}

// Sections already on screen stay put. Ones further down rise in when they arrive; they are visible either way.
if (!still && "IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        io.unobserve(entry.target);
        if (entry.target.matches(".reveal")) entry.target.classList.add("in");
        if (entry.target.matches("[data-decrypt]")) decrypt(entry.target);
      }
    },
    { rootMargin: "0px 0px -10% 0px" }
  );
  const below = (el) => el.getBoundingClientRect().top > innerHeight;
  $$(".reveal").forEach((el, i) => {
    if (!below(el)) return;
    el.style.setProperty("--d", `${(i % 3) * 0.08}s`);
    io.observe(el);
  });
  $$("[data-decrypt]").forEach((el) => io.observe(el));
}

// Magnet: the main buttons lean toward the cursor.
if (!still && finePointer) {
  $$("[data-magnet]").forEach((btn) => {
    const pad = 40, strength = 6;
    let frameReq = 0;
    window.addEventListener("pointermove", (e) => {
      cancelAnimationFrame(frameReq);
      frameReq = requestAnimationFrame(() => {
        const r = btn.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const near = Math.abs(e.clientX - cx) < r.width / 2 + pad && Math.abs(e.clientY - cy) < r.height / 2 + pad;
        btn.style.translate = near ? `${(e.clientX - cx) / strength}px ${(e.clientY - cy) / strength}px` : "0 0";
      });
    });
  });
}

// Click spark: a ring of short ink strokes where you click.
if (!still) {
  $$(".spark-wrap").forEach((wrap) => {
    wrap.addEventListener("click", (e) => {
      const canvas = document.createElement("canvas");
      const size = 90;
      canvas.className = "spark";
      canvas.width = canvas.height = size * devicePixelRatio;
      canvas.style.left = `${e.clientX - size / 2}px`;
      canvas.style.top = `${e.clientY - size / 2}px`;
      document.body.append(canvas);
      const ctx = canvas.getContext("2d");
      ctx.scale(devicePixelRatio, devicePixelRatio);
      const start = performance.now();
      const draw = (now) => {
        const t = Math.min((now - start) / 420, 1);
        const eased = t * (2 - t);
        ctx.clearRect(0, 0, size, size);
        ctx.strokeStyle = "#6a4cff";
        ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI * 2 * i) / 8;
          const d = 8 + eased * 24, len = 9 * (1 - eased);
          ctx.beginPath();
          ctx.moveTo(size / 2 + d * Math.cos(a), size / 2 + d * Math.sin(a));
          ctx.lineTo(size / 2 + (d + len) * Math.cos(a), size / 2 + (d + len) * Math.sin(a));
          ctx.stroke();
        }
        t < 1 ? requestAnimationFrame(draw) : canvas.remove();
      };
      requestAnimationFrame(draw);
    });
  });
}
