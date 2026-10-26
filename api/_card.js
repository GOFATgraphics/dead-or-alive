// Share cards: the stamp as an image people post. Wide (1200x630, the link-preview shape on X and
// LinkedIn) and square (1080x1080 for Instagram and LinkedIn posts), drawn at 2x so they stay sharp.
// Same look as the site: a dotted grey canvas, the first screen in a white browser frame, the verdict big
// in its colour, the sentence in quotes, the score with a bar, and for ALIVE the tier with its verified tick.
import path from "node:path";
import { GlobalFonts, Path2D, createCanvas, loadImage } from "@napi-rs/canvas";
import { COLORS } from "../src/stamp-draw.js";
import { SCALLOP, tierFor } from "../src/badge.js";

const SCALE = 2;
const INK = "#15142a";
const BODY = "#4f4d63";
const SOFT = "#8e8c99";
const CANVAS = "#f3f3f4";
const LINE = "#e6e5ea";
const SANS = '"Plus Jakarta Sans"';
const BOLD = '"Plus Jakarta Sans Bold"';
const HEAVY = '"Plus Jakarta Sans ExtraBold"';
const MONO = '"IBM Plex Mono"';

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

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// The grey canvas with its dot grid.
function ground(ctx, W, H) {
  ctx.fillStyle = CANVAS;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(21, 20, 42, 0.09)";
  for (let y = 7; y < H; y += 14) for (let x = 7; x < W; x += 14) ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
}

function shadowed(ctx, draw, blur = 40, offsetY = 18, alpha = 0.16) {
  ctx.save();
  ctx.shadowColor = `rgba(21, 20, 42, ${alpha})`;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = offsetY;
  draw();
  ctx.restore();
}

// The browser bar's height, and the frame height that shows the whole first screen at width w (at most maxH).
const BAR = 34;
const frameHeight = (shot, w, maxH) => Math.min(maxH, BAR + 1 + Math.round(shot.height * (w / shot.width)));

// The first screen in a white browser frame: three dots and the address, then the screenshot, cropped from the top.
function frame(ctx, shot, host, x, y, w, h) {
  const bar = BAR, r = 16;
  shadowed(ctx, () => {
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = "#fff";
    ctx.fill();
  });
  ctx.fillStyle = "#e3e2e8";
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(x + 18 + i * 14, y + bar / 2, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.font = `12px ${MONO}`;
  const label = host.length > 40 ? host.slice(0, 39) + "…" : host;
  const lw = ctx.measureText(label).width + 22;
  roundRect(ctx, x + 64, y + 8, lw, bar - 16, 6);
  ctx.fillStyle = CANVAS;
  ctx.fill();
  ctx.fillStyle = BODY;
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + 75, y + bar / 2 + 0.5);
  ctx.fillStyle = LINE;
  ctx.fillRect(x, y + bar, w, 1);

  const iy = y + bar + 1, ih = h - bar - 1;
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  const scale = w / shot.width;
  const srcH = Math.min(shot.height, ih / scale);
  ctx.fillStyle = "#fff";
  ctx.fillRect(x, iy, w, ih);
  ctx.drawImage(shot, 0, 0, shot.width, srcH, x, iy, w, srcH * scale);
  ctx.restore();
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.lineWidth = 1;
  ctx.strokeStyle = LINE;
  ctx.stroke();
}

// The roundel and "Stamp My Page".
let MARK = null;
function brand(ctx, x, cy, size) {
  if (MARK) ctx.drawImage(MARK, x, cy - size / 2, size, size);
  ctx.fillStyle = INK;
  ctx.font = `${size * 0.62}px ${HEAVY}`;
  ctx.letterSpacing = `${-size * 0.01}px`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("Stamp My Page", x + size + size * 0.32, cy + 1);
  ctx.letterSpacing = "0px";
}

// The scalloped verified tick in a tier's colours, centred at (cx, cy).
function tick(ctx, tier, cx, cy, size) {
  const s = size / 100;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(s, s);
  const p = new Path2D(SCALLOP);
  ctx.fillStyle = tier.tick.fill;
  ctx.fill(p);
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.strokeStyle = tier.tick.stroke;
  ctx.stroke(p);
  ctx.beginPath();
  ctx.moveTo(31, 51);
  ctx.lineTo(45, 64);
  ctx.lineTo(70, 37);
  ctx.lineWidth = 11;
  ctx.lineCap = "round";
  ctx.strokeStyle = tier.tick.check;
  ctx.stroke();
  ctx.restore();
}

// A white pill with the host (and the tick, for a tier). Returns its width.
function hostChip(ctx, r, tier, x, y, size) {
  const h = size * 2.1;
  ctx.font = `${size}px ${BOLD}`;
  const host = r.host.length > 34 ? r.host.slice(0, 33) + "…" : r.host;
  const tw = ctx.measureText(host).width;
  const w = tw + size * 1.6 + (tier ? size * 1.5 : 0);
  shadowed(ctx, () => {
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
  }, 10, 3, 0.08);
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  ctx.fillText(host, x + size * 0.8, y + h / 2 + 1);
  if (tier) tick(ctx, tier, x + size * 0.8 + tw + size * 0.85, y + h / 2, size * 1.15);
  return w;
}

// For ALIVE: a small metal pill with the tier name, in the tier card's colours.
function tierChip(ctx, tier, x, y, size) {
  const label = tier.name.toUpperCase();
  ctx.font = `${size}px ${HEAVY}`;
  ctx.letterSpacing = `${size * 0.14}px`;
  const tw = ctx.measureText(label).width;
  const h = size * 2.2, w = tw + size * 1.8;
  const c = tier.card;
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, c.from);
  g.addColorStop(0.5, c.mid);
  g.addColorStop(1, c.to);
  shadowed(ctx, () => {
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = g;
    ctx.fill();
  }, 12, 4, 0.18);
  ctx.fillStyle = c.ink;
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + size * 0.9, y + h / 2 + 1);
  ctx.letterSpacing = "0px";
  return w;
}

function verdictWord(ctx, verdict, x, y, size) {
  ctx.font = `${size}px ${HEAVY}`;
  ctx.letterSpacing = `${-size * 0.055}px`;
  ctx.fillStyle = COLORS[verdict];
  ctx.textBaseline = "alphabetic";
  ctx.fillText(verdict, x - size * 0.03, y);
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

// The sentence in quotes, at the biggest size (from `sizes`) that fits in maxLines. Returns the bottom edge.
function quote(ctx, text, x, y, maxW, sizes, maxLines) {
  const said = `“${String(text).trim()}”`;
  let lines, size;
  for (size of sizes) {
    ctx.font = `${size}px ${BOLD}`;
    ctx.letterSpacing = `${-size * 0.02}px`;
    lines = wrap(ctx, said, maxW);
    if (lines.length <= maxLines) break;
  }
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s+\S*$/, "") + "…”";
  }
  const lh = size * 1.24;
  ctx.fillStyle = INK;
  ctx.textBaseline = "alphabetic";
  lines.forEach((line, i) => ctx.fillText(line, x, y + size + i * lh));
  ctx.letterSpacing = "0px";
  return y + size + (lines.length - 1) * lh;
}

// "92/100" and a bar in the verdict colour. Older stamps without a score skip it.
function score(ctx, r, x, y, w, size) {
  if (!(r.score >= 0)) return;
  ctx.font = `${size}px ${HEAVY}`;
  ctx.letterSpacing = `${-size * 0.05}px`;
  ctx.fillStyle = INK;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(String(r.score), x, y);
  const nw = ctx.measureText(String(r.score)).width;
  ctx.letterSpacing = "0px";
  ctx.font = `${size * 0.42}px ${BOLD}`;
  ctx.fillStyle = SOFT;
  ctx.fillText("/100", x + nw + 4, y);
  const sw = ctx.measureText("/100").width;
  const bx = x + nw + sw + size * 0.5, bw = Math.max(40, w - (bx - x)), bh = size * 0.16, by = y - size * 0.32;
  roundRect(ctx, bx, by, bw, bh, bh / 2);
  ctx.fillStyle = "rgba(21, 20, 42, 0.08)";
  ctx.fill();
  roundRect(ctx, bx, by, Math.max(bh, (bw * Math.min(100, r.score)) / 100), bh, bh / 2);
  ctx.fillStyle = COLORS[r.verdict];
  ctx.fill();
}

const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmtNumber = (n) => `#${String(n || 0).padStart(4, "0")}`;

function footer(ctx, r, x, y, right, size) {
  ctx.font = `${size}px ${MONO}`;
  ctx.fillStyle = BODY;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillText(`Stamp ${fmtNumber(r.number)}  ·  ${fmtDate(r.createdAt)}`, x, y);
  ctx.font = `${size}px ${BOLD}`;
  ctx.fillStyle = INK;
  ctx.textAlign = "right";
  ctx.fillText("stampmypage.com", right, y);
  ctx.textAlign = "left";
}

function wide(shot, r) {
  const W = 1200, H = 630, M = 56;
  const c = createCanvas(W * SCALE, H * SCALE);
  const ctx = c.getContext("2d");
  ctx.scale(SCALE, SCALE);
  const tier = tierFor(r.verdict, r.score);
  ground(ctx, W, H);
  brand(ctx, M, 58, 30);

  // Right: the first screen, centred in its column.
  const fw = W - M - 600, fh = frameHeight(shot, fw, 470);
  frame(ctx, shot, r.host, 600, Math.round(300 - fh / 2), fw, fh);

  // Left: host, verdict, sentence, score.
  const cw = 600 - M - 40;
  let x = M;
  x += hostChip(ctx, r, tier, M, 110, 17) + 10;
  if (tier) tierChip(ctx, tier, x, 112, 13);
  verdictWord(ctx, r.verdict, M, 268, 124);
  const bottom = quote(ctx, r.sentence, M, 292, cw, [28, 26, 24, 22], 4);
  score(ctx, r, M, bottom + 72, cw, 44);

  footer(ctx, r, M, 588, W - M, 15);
  return c;
}

function square(shot, r) {
  const W = 1080, H = 1080, M = 64;
  const c = createCanvas(W * SCALE, H * SCALE);
  const ctx = c.getContext("2d");
  ctx.scale(SCALE, SCALE);
  const tier = tierFor(r.verdict, r.score);
  ground(ctx, W, H);
  brand(ctx, M, 70, 34);

  frame(ctx, shot, r.host, M, 120, W - M * 2, frameHeight(shot, W - M * 2, 470));

  let x = M;
  x += hostChip(ctx, r, tier, M, 630, 19) + 12;
  if (tier) tierChip(ctx, tier, x, 633, 14);
  verdictWord(ctx, r.verdict, M, 790, 128);
  ctx.font = `128px ${HEAVY}`;
  ctx.letterSpacing = `${-128 * 0.055}px`;
  const vw = ctx.measureText(r.verdict).width;
  ctx.letterSpacing = "0px";
  score(ctx, r, M + vw + 48, 786, W - M - (M + vw + 48), 52);
  quote(ctx, r.sentence, M, 820, W - M * 2, [38, 36, 34, 32, 30], 3);

  footer(ctx, r, M, 1024, W - M, 17);
  return c;
}

// shot: the screenshot (no stamp, no sentence).
// r: { verdict, sentence, host, createdAt, number, score?, focus? }. Returns JPEG buffers.
export async function renderCards(shot, r) {
  registerFonts();
  if (!MARK) MARK = await loadImage(path.join(process.cwd(), "public", "brand", "smp-mark.png"));
  const img = await loadImage(shot);
  return { wide: await wide(img, r).encode("jpeg", 90), square: await square(img, r).encode("jpeg", 90) };
}
