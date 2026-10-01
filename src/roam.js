// Box roams the desk: jumps out of the box, walks, sits, and comes back.
// stage.home() sends Box back into the box (someone is about to act). stage.resume() lets Box wander again.
import { Box, NAME } from "./mascot.js";

const CAT = `<svg viewBox="0 0 120 80" aria-hidden="true">
  <path class="tail" d="M30 46C16 44 10 30 16 18" />
  <rect class="leg far b" x="33" y="52" width="7" height="25" rx="3.5" />
  <rect class="leg far f" x="78" y="52" width="7" height="25" rx="3.5" />
  <ellipse class="body" cx="58" cy="48" rx="31" ry="15" />
  <rect class="leg near b" x="40" y="54" width="7" height="24" rx="3.5" />
  <rect class="leg near f" x="85" y="54" width="7" height="24" rx="3.5" />
  <g class="head">
    <path class="ear" d="M83 25l1-15 9 9zM98 19l7-10 2 14z" />
    <circle class="skull" cx="95" cy="32" r="14" />
    <g class="eyes"><circle cx="93" cy="30" r="2.1" /><circle cx="102" cy="30" r="2.1" /></g>
    <path class="nose" d="M106.5 35.5l2.5 1-2.5 1.2z" />
    <path class="whisker" d="M104 39l12-1M104 41.5l11 2.5" />
  </g>
</svg>`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
class Abort extends Error {}

export function createStage(el, { closed = false } = {}) {
  el.classList.add("stage");
  el.innerHTML = `<div class="stage-box"><div></div></div><div class="roamer" aria-hidden="true"><div class="roamer-flip">${CAT}</div></div>`;
  const holder = el.querySelector(".stage-box");
  const boxEl = holder.firstElementChild;
  const cat = el.querySelector(".roamer");
  const flip = el.querySelector(".roamer-flip");
  let box = Box.mount(boxEl, { state: closed ? "closed" : "idle" });
  holder.setAttribute("title", NAME);

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let gen = 0;
  let anim = null;
  let out = false; // Box is out of the box
  let pos = { x: 0, y: 0 };
  let homing = null;

  // Geometry, in px, measured fresh each time (the page can resize).
  function geo() {
    const B = holder.offsetWidth;
    const H = (B * 140) / 160;
    const R = cat.offsetWidth;
    const Rh = (R * 80) / 120;
    return { W: el.offsetWidth, B, R, Rh, open: (H * 60) / 140, mouthX: B / 2 - R / 2 };
  }

  const at = (x, y, o = 1) => ({ transform: `translate(${x}px, ${y}px)`, opacity: o });

  async function play(keyframes, opts, myGen) {
    if (still) {
      // Reduced motion: no travel. Fade out where Box is, fade in where Box is going.
      const a = keyframes[0], b = keyframes[keyframes.length - 1];
      keyframes = [a, { transform: a.transform, opacity: 0, offset: 0.45 }, { transform: b.transform, opacity: 0, offset: 0.55 }, b];
      opts = { duration: 500, easing: "linear" };
    }
    anim = cat.animate(keyframes, { fill: "forwards", ...opts });
    try {
      await anim.finished;
    } catch (_) {
      throw new Abort();
    }
    if (myGen !== gen) throw new Abort();
  }

  function face(left) {
    flip.classList.toggle("left", left);
  }

  // Box pops back up in the box: start sunk, then rise.
  function popUp() {
    box = Box.mount(boxEl, { state: "empty" });
    void boxEl.offsetWidth;
    boxEl.classList.replace("is-empty", "is-idle");
  }

  async function jumpOut(myGen) {
    const g = geo();
    // Box crouches into the box, then leaps out.
    box = Box.mount(boxEl, { state: "empty" });
    await sleep(280);
    if (myGen !== gen) throw new Abort();
    out = true;
    cat.classList.add("out");
    face(false);
    cat.classList.add("jump");
    const land = g.B + 12;
    await play(
      [at(g.mouthX, -g.open + g.Rh * 0.6, 0), at(g.mouthX + 6, -g.open - 10, 1), at((g.mouthX + land) / 2 + 10, -g.open - 34), at(land, 0)],
      { duration: 620, easing: "cubic-bezier(.3,.6,.4,1)" },
      myGen
    );
    cat.classList.remove("jump");
    pos = { x: land, y: 0 };
  }

  async function walkTo(x, speed, myGen) {
    const dx = x - pos.x;
    if (Math.abs(dx) < 2) return;
    face(dx < 0);
    cat.classList.add("walking");
    try {
      await play([at(pos.x, 0), at(x, 0)], { duration: (Math.abs(dx) / speed) * 1000, easing: "linear" }, myGen);
    } finally {
      cat.classList.remove("walking");
    }
    pos = { x, y: 0 };
  }

  async function jumpIn(myGen, fast) {
    const g = geo();
    if (!still) await walkTo(g.B + 10, fast ? 260 : 70, myGen);
    face(true);
    cat.classList.add("jump");
    await play(
      [at(pos.x, 0), at((pos.x + g.mouthX) / 2, -g.open - 36), at(g.mouthX, -g.open - 6, 1), at(g.mouthX, -g.open + g.Rh * 0.5, 0)],
      { duration: fast ? 420 : 560, easing: "cubic-bezier(.3,.6,.4,1)" },
      myGen
    );
    cat.classList.remove("jump");
    out = false;
    cat.classList.remove("out");
    popUp();
  }

  async function wander(myGen, firstDelay = rand(3000, 5000)) {
    let delay = firstDelay;
    while (myGen === gen) {
      await sleep(delay);
      delay = rand(3000, 5000);
      if (myGen !== gen) return;
      await jumpOut(myGen);
      const g = geo();
      const walks = Math.round(rand(2, 3));
      for (let i = 0; i < walks; i++) {
        const lo = g.B + 12, hi = Math.max(lo, g.W - g.R);
        await walkTo(rand(lo, hi), rand(55, 80), myGen);
        cat.classList.add("sitting");
        await sleep(rand(1200, 2600));
        cat.classList.remove("sitting");
        if (myGen !== gen) return;
      }
      await jumpIn(myGen, false);
    }
  }

  function interruptPosition() {
    if (!anim) return;
    const m = new DOMMatrixReadOnly(getComputedStyle(cat).transform);
    anim.cancel();
    anim = null;
    cat.style.transform = `translate(${m.m41}px, ${m.m42}px)`;
    cat.style.opacity = getComputedStyle(cat).opacity;
    pos = { x: m.m41, y: m.m42 };
    cat.classList.remove("walking", "sitting", "jump");
  }

  holder.addEventListener("click", () => {
    if (closed || out || homing) return;
    api.start(0);
  });
  cat.addEventListener("click", () => {
    api.home().then(() => api.resume(4000));
  });

  const api = {
    get out() {
      return out;
    },
    // Box comes out about a second after the page opens.
    start(firstDelay = 1200) {
      if (closed) return;
      const myGen = ++gen;
      wander(myGen, firstDelay).catch((e) => {
        if (!(e instanceof Abort)) throw e;
      });
    },
    // Someone is about to act: Box hurries back into the box and watches.
    home() {
      if (closed) return Promise.resolve();
      if (homing) return homing;
      const myGen = ++gen;
      interruptPosition();
      if (!out) {
        if (boxEl.classList.contains("is-empty")) popUp();
        box.look();
        return Promise.resolve();
      }
      homing = (async () => {
        try {
          if (pos.y < -1) {
            // Mid-air: land first.
            await play([at(pos.x, pos.y), at(pos.x, 0)], { duration: 180, easing: "ease-in" }, myGen);
            pos.y = 0;
          }
          await jumpIn(myGen, true);
          box.look();
        } catch (e) {
          if (!(e instanceof Abort)) throw e;
        } finally {
          homing = null;
        }
      })();
      return homing;
    },
    look() {
      if (!out) box.look();
    },
    // Wander again after a quiet spell.
    resume(delay = 6000) {
      if (closed) return;
      const myGen = ++gen;
      sleep(delay).then(() => {
        if (myGen !== gen) return;
        (homing || Promise.resolve()).then(() => myGen === gen && wander(myGen).catch((e) => {
          if (!(e instanceof Abort)) throw e;
        }));
      });
    },
    stop() {
      gen++;
      interruptPosition();
    },
  };
  return api;
}
