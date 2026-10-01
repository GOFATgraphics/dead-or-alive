// Box, the desk cat. Schrödinger's: dead or alive until someone looks.
// Usage: Box.mount(el, { state: "idle" | "looking" | "closed" | "verdict", verdict: "DEAD" | "COPE" | "ALIVE" })
export const NAME = "Box";
const COLORS = { DEAD: "var(--dead)", COPE: "var(--cope)", ALIVE: "var(--alive)" };

function eyes(verdict) {
  if (verdict === "DEAD")
    return `<g class="eyes-x"><path d="M64 49l8 8M72 49l-8 8M88 49l8 8M96 49l-8 8" /></g>`;
  if (verdict === "ALIVE")
    return `<g class="eyes-happy"><path d="M63 55q5-7 10 0M87 55q5-7 10 0" /></g>`;
  const lid = verdict === "COPE" ? `<path class="eyelid" d="M60 49.5h16M84 49.5h16" />` : "";
  return `<g class="eyes">
    <g class="eye"><ellipse cx="68" cy="53" rx="5.5" ry="6.5" class="white" /><circle class="pupil" cx="68" cy="54" r="2.6" /></g>
    <g class="eye"><ellipse cx="92" cy="53" rx="5.5" ry="6.5" class="white" /><circle class="pupil" cx="92" cy="54" r="2.6" /></g>
    ${lid}
  </g>`;
}

function sign(verdict) {
  if (!verdict) return "";
  return `<g class="sign" style="color:${COLORS[verdict]}">
    <rect x="52" y="64" width="56" height="20" />
    <text x="80" y="78.5">${verdict}</text>
  </g>`;
}

function ghost() {
  return `<g class="ghost">
    <path d="M128 40c0-10 6-17 14-17s14 7 14 17v14l-3.5-3-3.5 3-3.5-3-3.5 3-3.5-3-3.5 3-3.5-3-3.5 3z" />
    <path d="M131 30l-2-9 7 5M153 30l2-9-7 5" />
    <path d="M136 36l4 4M140 36l-4 4M144 36l4 4M148 36l-4 4" />
  </g>`;
}

let uid = 0;

function svg(state, verdict) {
  const clip = "box-rim-" + ++uid;
  return `<svg viewBox="0 0 160 140" role="img" aria-label="${label(state, verdict)}">
    <defs><clipPath id="${clip}"><rect x="0" y="0" width="160" height="81" /></clipPath></defs>
    <path class="flap back" d="M38 80l6-12h72l6 12z" />
    <g clip-path="url(#${clip})">
      <g class="cat">
        <path class="ear left" d="M54 44L52 18l20 14z" />
        <path class="ear right" d="M106 44l2-26-20 14z" />
        <path class="head" d="M80 26c-20 0-32 13-32 32 0 14 8 24 14 28h36c6-4 14-14 14-28 0-19-12-32-32-32z" />
        ${eyes(verdict)}
        <path class="nose" d="M77.5 62h5L80 65z" />
        <path class="mouth" d="M80 65q-3 4-6 2M80 65q3 4 6 2" />
        <path class="whisker" d="M60 64l-16-2M60 68l-15 3M100 64l16-2M100 68l15 3" />
      </g>
    </g>
    <path class="flap left" d="M30 80L8 66l8-8 20 14z" />
    <path class="flap right" d="M130 80l22-14-8-8-20 14z" />
    <path class="face" d="M30 80h100v54H30z" />
    <path class="seam" d="M30 92h100" />
    <text class="label" x="80" y="118">${state === "closed" ? "BUSY" : "THIS SIDE UP"}</text>
    <g class="lid">
      <path d="M30 80l8-8h84l8 8z" />
      <path class="tape" d="M74 72h12v10H74z" />
    </g>
    <g class="paws">
      <ellipse cx="66" cy="81" rx="7" ry="4.5" />
      <ellipse cx="94" cy="81" rx="7" ry="4.5" />
    </g>
    ${state === "verdict" ? sign(verdict) : ""}
    ${state === "verdict" && verdict === "DEAD" ? ghost() : ""}
    <g class="dots"><circle cx="66" cy="62" r="2.5" /><circle cx="80" cy="62" r="2.5" /><circle cx="94" cy="62" r="2.5" /></g>
  </svg>`;
}

function label(state, verdict) {
  if (state === "looking") return `${NAME} the cat is inside the box, looking at your page.`;
  if (state === "closed") return `${NAME} the cat's box is taped shut.`;
  if (state === "verdict") return `${NAME} the cat holds up a ${verdict} stamp.`;
  return `${NAME} the cat peeks out of a cardboard box.`;
}

function mount(el, opts = {}) {
  const state = opts.state || "idle";
  const verdict = opts.verdict || "";
  el.className = "box-cat is-" + state;
  if (verdict) el.classList.add("v-" + verdict.toLowerCase());
  el.innerHTML = svg(state, verdict);
  let timer;
  return {
    look() {
      el.classList.add("is-reading");
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove("is-reading"), 1500);
    },
  };
}

export const Box = { NAME, mount };
