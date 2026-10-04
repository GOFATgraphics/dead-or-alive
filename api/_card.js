// Share cards: the stamp as an image people post. Wide (1200x630, the link-preview shape on X and
// LinkedIn) and square (1080x1080 for Instagram and LinkedIn posts), drawn at 2x so they stay sharp.
// Layout: the circled first screen in a browser frame, a rubber stamp thumped across it, the verdict line,
// the sentence in big type, and the page, date, stamp number, and stampmypage.com.
import path from "node:path";
import { GlobalFonts, createCanvas, loadImage } from "@napi-rs/canvas";
import { COLORS } from "../src/stamp-draw.js";

const SCALE = 2;
const INK = "#12132a";
const MUTED = "#6b6e8c";
const FRAME_LINE = "#e6e3f1";
const DASH = "#cdbfee";
const SANS = '"Plus Jakarta Sans"';
const BOLD = '"Plus Jakarta Sans Bold"';
const HEAVY = '"Plus Jakarta Sans ExtraBold"';
const MONO = '"IBM Plex Mono"';
const MONO_BOLD = '"IBM Plex Mono Bold"';
const LABEL = { DEAD: "DEAD ON ARRIVAL", COPE: "COPE", ALIVE: "ALIVE" };

let fontsReady = false;
export function registerFonts() {
  if (fontsReady) return;
  const pub = path.join(process.cwd(), "public", "fonts");
  const srv = path.join(process.cwd(), "server-fonts");
  GlobalFonts.registerFromPath(path.join(pub, "plus-jakarta-sans-latin-v12.woff2"), "Plus Jakarta Sans");
  GlobalFonts.registerFromPath(path.join(pub, "ibm-plex-mono-500-latin-v20.woff2"), "IBM Plex Mono");
  GlobalFonts.registerFromPath(path.join(srv, "plus-jakarta-sans-700.woff2"), "Plus Jakarta Sans Bold");
  GlobalFonts.registerFromPath(path.join(srv, "plus-jakarta-sans-800.woff2"), "Plus Jakarta Sans ExtraBold");
  GlobalFonts.registerFromPath(path.join(srv, "ibm-plex-mono-700.woff2"), "IBM Plex Mono Bold");
  fontsReady = true;
}

// Same stamp number, same speckles: the texture is seeded so re-rendering a card doesn't change it.
function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function background(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#e5e8f6");
  g.addColorStop(0.45, "#efe6f7");
  g.addColorStop(1, "#f6e4ef");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = DASH;
  roundRect(ctx, 14, 14, w - 28, h - 28, 26);
  ctx.stroke();
  ctx.restore();
}

// The circled screenshot inside a browser window with the customer's address in the bar.
// focus: { top, bottom } as fractions of the screenshot height, so the circles stay in view when cropping.
function browser(ctx, shot, host, x, y, w, h, focus) {
  const bar = 34;
  ctx.save();
  ctx.shadowColor = "rgba(70, 50, 150, 0.16)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  roundRect(ctx, x, y, w, h, 18);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, x, y, w, h, 18);
  ctx.clip();
  ctx.fillStyle = "#faf9fd";
  ctx.fillRect(x, y, w, bar);
  // The window shows the screenshot at full width, cropped vertically around the circles.
  const viewH = h - bar;
  const scale = w / shot.width;
  const srcH = Math.min(shot.height, viewH / scale);
  const top = Math.max(0, Math.min(focus?.top ?? 0, 1)) * shot.height;
  const bottom = Math.max(0, Math.min(focus?.bottom ?? 0, 1)) * shot.height;
  let sy = 0;
  if (bottom > srcH) sy = Math.min(top - 20, bottom - srcH + 30);
  sy = Math.max(0, Math.min(sy, shot.height - srcH));
  ctx.drawImage(shot, 0, sy, shot.width, srcH, x, y + bar, w, srcH * scale);
  ctx.restore();

  ctx.fillStyle = FRAME_LINE;
  ctx.fillRect(x, y + bar, w, 1);
  ctx.fillStyle = "#d9d8e4";
  [0, 17, 34].forEach((dx) => {
    ctx.beginPath();
    ctx.arc(x + 20 + dx, y + bar / 2, 5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.font = `13px ${SANS}`;
  const tw = ctx.measureText(host).width;
  ctx.fillStyle = "#f0eef7";
  roundRect(ctx, x + 78, y + 7, tw + 24, 20, 8);
  ctx.fill();
  ctx.fillStyle = "#4a4d68";
  ctx.textBaseline = "middle";
  ctx.fillText(host, x + 90, y + 17.5);

  ctx.save();
  roundRect(ctx, x, y, w, h, 18);
  ctx.lineWidth = 1;
  ctx.strokeStyle = FRAME_LINE;
  ctx.stroke();
  ctx.restore();
}

// A rubber stamp: double border, heavy letters, ink that didn't take everywhere.
function stamp(ctx, verdict, cx, cy, fontSize, seed) {
  const color = COLORS[verdict];
  const pad = fontSize * 0.55;
  const m = createCanvas(10, 10).getContext("2d");
  m.font = `${fontSize}px ${MONO_BOLD}`;
  m.letterSpacing = `${fontSize * 0.12}px`;
  const textW = m.measureText(verdict).width - fontSize * 0.12;
  const w = textW + pad * 2.2, h = fontSize * 1.45;

  const S = SCALE;
  const size = Math.ceil(Math.hypot(w, h) + 40);
  const inset = fontSize * 0.16;
  const off = createCanvas(size * S, size * S);
  const o = off.getContext("2d");
  o.scale(S, S);
  o.translate(size / 2, size / 2);
  o.strokeStyle = o.fillStyle = color;
  o.lineWidth = fontSize * 0.1;
  roundRect(o, -w / 2, -h / 2, w, h, fontSize * 0.14);
  o.stroke();
  o.lineWidth = fontSize * 0.035;
  roundRect(o, -w / 2 - inset, -h / 2 - inset, w + inset * 2, h + inset * 2, fontSize * 0.2);
  o.stroke();
  o.font = `${fontSize}px ${MONO_BOLD}`;
  o.letterSpacing = `${fontSize * 0.12}px`;
  o.textBaseline = "middle";
  o.textAlign = "left";
  o.fillText(verdict, -textW / 2, fontSize * 0.04);

  // Worn ink: fine grain knocked out of the ink only, plus a few bigger gaps where the stamp didn't land.
  const rand = rng(seed);
  o.globalCompositeOperation = "destination-out";
  const spanX = w + inset * 2 + 12, spanY = h + inset * 2 + 12;
  for (let i = 0; i < 26000; i++) {
    o.globalAlpha = 0.25 + rand() * 0.75;
    const r = 0.18 + rand() * rand() * 0.75;
    o.fillRect((rand() - 0.5) * spanX, (rand() - 0.5) * spanY, r, r);
  }
  for (let i = 0; i < 70; i++) {
    o.globalAlpha = 0.3 + rand() * 0.4;
    o.beginPath();
    o.arc((rand() - 0.5) * spanX, (rand() - 0.5) * spanY, 0.8 + rand() * 2.2, 0, Math.PI * 2);
    o.fill();
  }
  o.globalAlpha = 1;
  o.globalCompositeOperation = "source-over";

  // Paper under the ink: the page shows through a little, like ink on a printout.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-11 * Math.PI) / 180);
  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  roundRect(ctx, -w / 2, -h / 2, w, h, fontSize * 0.14);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-11 * Math.PI) / 180);
  ctx.globalAlpha = 0.93;
  ctx.drawImage(off, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function verdictLine(ctx, verdict, x, y, size) {
  const color = COLORS[verdict];
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + size * 0.32, y - size * 0.34, size * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `${size}px ${MONO}`;
  ctx.letterSpacing = `${size * 0.2}px`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`VERDICT · ${LABEL[verdict]}`, x + size * 1.25, y);
  ctx.letterSpacing = "0px";
}

function wrap(ctx, text, max) {
  const lines = [];
  let line = "";
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const t = line ? `${line} ${word}` : word;
    if (ctx.measureText(t).width > max && line) {
      lines.push(line);
      line = word;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

// The biggest size (down to min) at which the sentence fits in maxLines.
function quote(ctx, text, x, y, maxW, sizes, maxLines) {
  let lines, size;
  for (size of sizes) {
    ctx.font = `${size}px ${HEAVY}`;
    ctx.letterSpacing = `${-size * 0.035}px`;
    lines = wrap(ctx, text, maxW);
    if (lines.length <= maxLines) break;
  }
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s+\S*$/, "") + "…";
  }
  ctx.fillStyle = INK;
  ctx.textBaseline = "alphabetic";
  lines.forEach((line, i) => ctx.fillText(line, x, y + size + i * size * 1.13));
  ctx.letterSpacing = "0px";
}

function fact(ctx, label, value, x, y, valueX, valueFont) {
  ctx.fillStyle = MUTED;
  ctx.font = `11px ${MONO}`;
  ctx.letterSpacing = "2.6px";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(label, x, y);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = INK;
  ctx.font = valueFont;
  ctx.fillText(value, valueX, y + 1);
}

// Box's ears over a violet tile, as in the site logo.
function logo(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 32, s / 32);
  const g = ctx.createLinearGradient(0, 0, 32, 32);
  g.addColorStop(0, "#9a7dff");
  g.addColorStop(1, "#4b2ee0");
  ctx.fillStyle = g;
  roundRect(ctx, 1, 1, 30, 30, 9);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(9, 21);
  ctx.lineTo(9, 12);
  ctx.lineTo(13, 15.2);
  ctx.quadraticCurveTo(16, 14.2, 19, 15.2);
  ctx.lineTo(23, 12);
  ctx.lineTo(23, 21);
  ctx.arc(16, 21, 7, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = "#3b2bc2";
  for (const cx of [13.3, 18.7]) {
    ctx.beginPath();
    ctx.arc(cx, 20, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#e4c69c";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  roundRect(ctx, 6, 22.5, 20, 5, 1.5);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function brand(ctx, right, y, size) {
  ctx.font = `${size}px ${BOLD}`;
  const text = "stampmypage.com";
  const tw = ctx.measureText(text).width;
  const mark = size * 1.55;
  const start = right - tw - mark - size * 0.55;
  logo(ctx, start, y - mark / 2, mark);
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  ctx.fillText(text, start + mark + size * 0.55, y + 1);
}

const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmtNumber = (n) => `#${String(n || 0).padStart(4, "0")}`;

function fitFont(ctx, text, font, size, max) {
  ctx.font = font(size);
  while (ctx.measureText(text).width > max && size > 10) ctx.font = font(--size);
}

function wide(shot, r) {
  const W = 1200, H = 630;
  const c = createCanvas(W * SCALE, H * SCALE);
  const ctx = c.getContext("2d");
  ctx.scale(SCALE, SCALE);
  background(ctx, W, H);
  browser(ctx, shot, r.host, 40, 36, 1120, 388, r.focus);
  stamp(ctx, r.verdict, 860, 270, r.verdict.length > 4 ? 76 : 90, r.number || 1);

  verdictLine(ctx, r.verdict, 40, 480, 13);
  quote(ctx, r.sentence, 40, 494, 660, [38, 36, 34, 32, 30, 28], 2);

  ctx.save();
  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = DASH;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(830.5, 450);
  ctx.lineTo(830.5, 594);
  ctx.stroke();
  ctx.restore();

  const value = (s) => `${s}px ${BOLD}`;
  fitFont(ctx, r.host, value, 17, 1160 - 940);
  const hostFont = ctx.font;
  fact(ctx, "PAGE", r.host, 862, 481, 940, hostFont);
  fact(ctx, "STAMPED", fmtDate(r.createdAt), 862, 508, 940, value(17));
  fact(ctx, "STAMP", fmtNumber(r.number), 862, 537, 940, `19px ${MONO}`);
  brand(ctx, 1160, 583, 15);
  return c;
}

function square(shot, r) {
  const W = 1080, H = 1080;
  const c = createCanvas(W * SCALE, H * SCALE);
  const ctx = c.getContext("2d");
  ctx.scale(SCALE, SCALE);
  background(ctx, W, H);
  browser(ctx, shot, r.host, 40, 40, 1000, 620, r.focus);
  stamp(ctx, r.verdict, 600, 500, r.verdict.length > 4 ? 110 : 128, r.number || 1);

  verdictLine(ctx, r.verdict, 40, 762, 16);
  quote(ctx, r.sentence, 40, 780, 1000, [54, 50, 46, 42, 38], 3);

  ctx.save();
  ctx.setLineDash([5, 6]);
  ctx.strokeStyle = DASH;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, 955.5);
  ctx.lineTo(1040, 955.5);
  ctx.stroke();
  ctx.restore();

  const value = (s) => `${s}px ${BOLD}`;
  let x = 40;
  const y = 1012;
  for (const [label, text, font] of [
    ["PAGE", r.host, null],
    ["STAMPED", fmtDate(r.createdAt), value(20)],
    ["STAMP", fmtNumber(r.number), `22px ${MONO}`],
  ]) {
    ctx.font = `11px ${MONO}`;
    ctx.letterSpacing = "2.6px";
    const lw = ctx.measureText(label).width;
    ctx.letterSpacing = "0px";
    if (!font) fitFont(ctx, text, value, 20, 230);
    const f = font || ctx.font;
    fact(ctx, label, text, x, y, x + lw + 12, f);
    ctx.font = f;
    x += lw + 12 + ctx.measureText(text).width + 34;
  }
  brand(ctx, 1040, y - 6, 16);
  return c;
}

// shot: the circled screenshot (no stamp, no sentence).
// r: { verdict, sentence, host, createdAt, number, focus? }. Returns JPEG buffers.
export async function renderCards(shot, r) {
  registerFonts();
  const img = await loadImage(shot);
  return { wide: await wide(img, r).encode("jpeg", 90), square: await square(img, r).encode("jpeg", 90) };
}
