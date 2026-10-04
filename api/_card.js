// Share cards: the stamp as an image people post. Wide (1200x630, the link-preview shape on X and
// LinkedIn) and square (1080x1080 for Instagram and LinkedIn posts), drawn at 2x so they stay sharp.
// Flat, editorial layout: a verdict-coloured rule, the brand, the circled first screen left uncovered,
// the verdict as a badge, the sentence as the headline, and the page, date and stamp number underneath.
import path from "node:path";
import { GlobalFonts, createCanvas, loadImage } from "@napi-rs/canvas";
import { COLORS } from "../src/stamp-draw.js";

const SCALE = 2;
const INK = "#12132a";
const MUTED = "#6b6e8c";
const SANS = '"Plus Jakarta Sans"';
const BOLD = '"Plus Jakarta Sans Bold"';
const HEAVY = '"Plus Jakarta Sans ExtraBold"';

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

const PAPER = "#ffffff";
const LINE = "#e4e4ec";
const TINT = { DEAD: "#fdecec", COPE: "#fdf1e3", ALIVE: "#e8f5ee" };

function base(ctx, W, H, verdict) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = COLORS[verdict];
  ctx.fillRect(0, 0, W, 8);
}

// The circled screenshot, uncovered, with a hairline border. Cropped vertically around the circles if needed.
// focus: { top, bottom } as fractions of the screenshot height.
function screenshot(ctx, shot, x, y, w, h, focus) {
  h = Math.min(h, Math.round(shot.height * (w / shot.width)));
  ctx.save();
  ctx.shadowColor = "rgba(18, 19, 42, 0.10)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, x, y, w, h, 12);
  ctx.clip();
  const scale = w / shot.width;
  const srcH = Math.min(shot.height, h / scale);
  const top = Math.max(0, Math.min(focus?.top ?? 0, 1)) * shot.height;
  const bottom = Math.max(0, Math.min(focus?.bottom ?? 0, 1)) * shot.height;
  let sy = 0;
  if (bottom > srcH) sy = Math.min(top - 20, bottom - srcH + 30);
  sy = Math.max(0, Math.min(sy, shot.height - srcH));
  ctx.drawImage(shot, 0, sy, shot.width, srcH, x, y, w, srcH * scale);
  ctx.restore();

  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 12);
  ctx.lineWidth = 1;
  ctx.strokeStyle = LINE;
  ctx.stroke();
}

// The brand: the ring mark (the roundel's detail is lost at this size) and the wordmark.
let ICON = null;
function brand(ctx, x, cy, size) {
  if (ICON) ctx.drawImage(ICON, x, cy - size / 2, size, size);
  ctx.fillStyle = INK;
  ctx.font = `${size * 0.5}px ${HEAVY}`;
  ctx.letterSpacing = `${size * 0.02}px`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("STAMP MY PAGE", x + size + size * 0.36, cy + 1);
  ctx.letterSpacing = "0px";
}

// The verdict as a crisp badge: tinted fill, solid border, heavy letters. Returns its height.
function badge(ctx, verdict, x, y, size) {
  ctx.font = `${size}px ${HEAVY}`;
  ctx.letterSpacing = `${size * 0.06}px`;
  const tw = ctx.measureText(verdict).width - size * 0.06;
  const padX = size * 0.42, h = size * 1.32;
  const w = tw + padX * 2;
  roundRect(ctx, x, y, w, h, size * 0.16);
  ctx.fillStyle = TINT[verdict];
  ctx.fill();
  ctx.lineWidth = Math.max(3, size * 0.06);
  ctx.strokeStyle = COLORS[verdict];
  ctx.stroke();
  ctx.fillStyle = COLORS[verdict];
  ctx.textBaseline = "middle";
  ctx.fillText(verdict, x + padX, y + h / 2 + size * 0.04);
  ctx.letterSpacing = "0px";
  return h;
}

function label(ctx, text, x, y, size, color = MUTED, align = "left") {
  ctx.font = `${size}px ${BOLD}`;
  ctx.letterSpacing = `${size * 0.12}px`;
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.letterSpacing = "0px";
  ctx.textAlign = "left";
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
  const said = `\u201c${String(text).trim()}\u201d`;
  let lines, size;
  for (size of sizes) {
    ctx.font = `${size}px ${BOLD}`;
    ctx.letterSpacing = `${-size * 0.02}px`;
    lines = wrap(ctx, said, maxW);
    if (lines.length <= maxLines) break;
  }
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s+\S*$/, "") + "\u2026\u201d";
  }
  const lh = size * 1.22;
  ctx.fillStyle = INK;
  ctx.textBaseline = "alphabetic";
  lines.forEach((line, i) => ctx.fillText(line, x, y + size + i * lh));
  ctx.letterSpacing = "0px";
  return y + size + (lines.length - 1) * lh;
}

// Page, date, and stamp number on one line: host in ink, the rest muted.
function meta(ctx, r, x, y, size, maxW) {
  const rest = `  \u00b7  ${fmtDate(r.createdAt)}  \u00b7  ${fmtNumber(r.number)}`;
  ctx.font = `${size}px ${SANS}`;
  const restW = ctx.measureText(rest).width;
  let s = size;
  ctx.font = `${s}px ${BOLD}`;
  while (ctx.measureText(r.host).width > maxW - restW && s > 11) ctx.font = `${--s}px ${BOLD}`;
  ctx.fillStyle = INK;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(r.host, x, y);
  const hw = ctx.measureText(r.host).width;
  ctx.font = `${size}px ${SANS}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(rest, x + hw, y);
}

function rule(ctx, x1, x2, y) {
  ctx.fillStyle = LINE;
  ctx.fillRect(x1, y, x2 - x1, 1);
}

const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmtNumber = (n) => `Stamp #${String(n || 0).padStart(4, "0")}`;

function wide(shot, r) {
  const W = 1200, H = 630, M = 48;
  const c = createCanvas(W * SCALE, H * SCALE);
  const ctx = c.getContext("2d");
  ctx.scale(SCALE, SCALE);
  base(ctx, W, H, r.verdict);
  brand(ctx, M, 52, 30);
  label(ctx, "FIRST-SCREEN VERDICT", W - M, 57, 12, MUTED, "right");

  screenshot(ctx, shot, M, 100, 640, 420, r.focus);

  const cx = 728, cw = W - M - cx;
  label(ctx, "VERDICT", cx, 112, 12);
  const bh = badge(ctx, r.verdict, cx, 128, 54);
  quote(ctx, r.sentence, cx, 128 + bh + 22, cw, [30, 28, 26, 24, 22], 6);

  rule(ctx, M, W - M, 548);
  meta(ctx, r, M, 588, 17, 760);
  ctx.font = `17px ${BOLD}`;
  ctx.fillStyle = INK;
  ctx.textAlign = "right";
  ctx.fillText("stampmypage.com", W - M, 588);
  ctx.textAlign = "left";
  return c;
}

function square(shot, r) {
  const W = 1080, H = 1080, M = 56;
  const c = createCanvas(W * SCALE, H * SCALE);
  const ctx = c.getContext("2d");
  ctx.scale(SCALE, SCALE);
  base(ctx, W, H, r.verdict);
  brand(ctx, M, 62, 34);
  label(ctx, "FIRST-SCREEN VERDICT", W - M, 68, 13, MUTED, "right");

  screenshot(ctx, shot, M, 112, W - M * 2, 560, r.focus);

  const bh = badge(ctx, r.verdict, M, 712, 50);
  quote(ctx, r.sentence, M, 712 + bh + 24, W - M * 2, [42, 40, 38, 36, 34, 32], 3);

  rule(ctx, M, W - M, 976);
  meta(ctx, r, M, 1022, 20, 680);
  ctx.font = `20px ${BOLD}`;
  ctx.fillStyle = INK;
  ctx.textAlign = "right";
  ctx.fillText("stampmypage.com", W - M, 1022);
  ctx.textAlign = "left";
  return c;
}

// shot: the circled screenshot (no stamp, no sentence).
// r: { verdict, sentence, host, createdAt, number, focus? }. Returns JPEG buffers.
export async function renderCards(shot, r) {
  registerFonts();
  if (!ICON) ICON = await loadImage(path.join(process.cwd(), "public", "brand", "smp-mark.png"));
  const img = await loadImage(shot);
  return { wide: await wide(img, r).encode("jpeg", 90), square: await square(img, r).encode("jpeg", 90) };
}
