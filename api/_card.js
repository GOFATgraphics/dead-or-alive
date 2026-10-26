// Share cards: the stamp as an image people post. Wide (1200x630, the link-preview shape on X and
// LinkedIn) and square (1080x1080 for Instagram and LinkedIn posts), drawn at 2x so they stay sharp.
// Clean and dark: a flat near-black ground with faint dots, the circled first screen in a tilted browser
// frame with an engraved seal on its corner, the verdict in solid colour, a score ring, and for ALIVE the
// tier pill and verified tick. No gradients, no glow, no grain.
import path from "node:path";
import { GlobalFonts, Path2D, createCanvas, loadImage } from "@napi-rs/canvas";
import { SCALLOP, tierFor } from "../src/badge.js";

const SCALE = 2;
const NIGHT = "#0b0b10";
const WHITE = "#f5f4f8";
const SOFT = "#a3a1b3";
const DIM = "#6e6c80";
// Verdict colours, lifted for a dark ground; `light` is the seal's centre word.
const V = {
  DEAD: { main: "#ff5a52", light: "#ffb3ab" },
  COPE: { main: "#ffb547", light: "#ffe0a8" },
  ALIVE: { main: "#35d985", light: "#b9f5d4" },
};
const SANS = '"Plus Jakarta Sans"';
const BOLD = '"Plus Jakarta Sans Bold"';
const HEAVY = '"Plus Jakarta Sans ExtraBold"';
const MONO = '"IBM Plex Mono"';
const MONO_BOLD = '"IBM Plex Mono Bold"';

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

// Flat night ground with a faint dot grid.
function ground(ctx, W, H) {
  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255, 255, 255, 0.045)";
  for (let y = 9; y < H; y += 18) for (let x = 9; x < W; x += 18) ctx.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
}

let MARK = null;
function brand(ctx, x, cy, size) {
  if (MARK) ctx.drawImage(MARK, x, cy - size / 2, size, size);
  ctx.fillStyle = WHITE;
  ctx.font = `${size * 0.6}px ${HEAVY}`;
  ctx.letterSpacing = `${-size * 0.01}px`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("Stamp My Page", x + size + size * 0.32, cy + 1);
  ctx.letterSpacing = "0px";
}

function label(ctx, text, x, y, size, color = SOFT, align = "left") {
  ctx.font = `${size}px ${MONO}`;
  ctx.letterSpacing = `${size * 0.22}px`;
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.letterSpacing = "0px";
  ctx.textAlign = "left";
}

// The first screen in a dark glass browser frame, tilted a little, with a soft drop shadow and a rim light.
const BAR = 30;
const frameHeight = (shot, w, maxH) => Math.min(maxH, BAR + Math.round(shot.height * (w / shot.width)));
function frame(ctx, shot, host, cx, cy, w, h, angle) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  const x = -w / 2, y = -h / 2, r = 16;
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 30;
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = "#16161f";
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.fillStyle = "#1c1c27";
  ctx.fillRect(x, y, w, BAR);
  ["#ff5f57", "#febc2e", "#28c840"].forEach((col, i) => {
    ctx.beginPath();
    ctx.arc(x + 18 + i * 15, y + BAR / 2, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
  });
  ctx.font = `12px ${MONO}`;
  const lab = host.length > 38 ? host.slice(0, 37) + "…" : host;
  const lw = ctx.measureText(lab).width + 22;
  roundRect(ctx, x + w / 2 - lw / 2, y + 6, lw, BAR - 12, 6);
  ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
  ctx.fill();
  ctx.fillStyle = SOFT;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(lab, x + w / 2, y + BAR / 2 + 0.5);
  ctx.textAlign = "left";
  const scale = w / shot.width;
  const srcH = Math.min(shot.height, (h - BAR) / scale);
  ctx.fillStyle = "#fff";
  ctx.fillRect(x, y + BAR, w, h - BAR);
  ctx.drawImage(shot, 0, 0, shot.width, srcH, x, y + BAR, w, srcH * scale);
  ctx.restore();
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.stroke();
  ctx.restore();
}

// An engraved round seal: rings, text running round the edge, the verdict and score in the middle.
function seal(ctx, verdict, score, number, cx, cy, R, angle) {
  const c = V[verdict];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 14;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fillStyle = "#15151d";
  ctx.fill();
  ctx.restore();
  const ring = (r, wdt, dash) => {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.setLineDash(dash || []);
    ctx.lineWidth = wdt;
    ctx.strokeStyle = c.main;
    ctx.stroke();
    ctx.setLineDash([]);
  };
  ring(R - 4, 2);
  ring(R - 10, 1, [1.5, 3.5]);
  ring(R * 0.62, 1);
  // Text round the edge.
  const text = `STAMP MY PAGE · FIRST SCREEN · NO. ${String(number || 0).padStart(4, "0")} · `;
  const size = R * 0.105;
  ctx.font = `${size}px ${MONO_BOLD}`;
  ctx.fillStyle = c.main;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const rt = R * 0.8;
  const step = (Math.PI * 2) / text.length;
  for (let i = 0; i < text.length; i++) {
    const a = -Math.PI / 2 + i * step;
    ctx.save();
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(text[i], 0, -rt);
    ctx.restore();
  }
  // Centre.
  ctx.font = `${R * 0.3}px ${HEAVY}`;
  ctx.letterSpacing = `${R * 0.01}px`;
  ctx.fillStyle = c.light;
  ctx.fillText(verdict, 0, -R * 0.06);
  ctx.letterSpacing = "0px";
  if (score >= 0) {
    ctx.font = `${R * 0.14}px ${MONO_BOLD}`;
    ctx.fillStyle = c.main;
    ctx.fillText(`${score} / 100`, 0, R * 0.24);
  }
  ctx.textAlign = "left";
  ctx.restore();
}

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

// A glass pill with the host, and the tick for a tier. Returns its width.
function hostChip(ctx, host, tier, x, y, size) {
  const h = size * 2.1;
  ctx.font = `${size}px ${BOLD}`;
  const name = host.length > 30 ? host.slice(0, 29) + "…" : host;
  const tw = ctx.measureText(name).width;
  const w = tw + size * 1.7 + (tier ? size * 1.5 : 0);
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.stroke();
  ctx.fillStyle = WHITE;
  ctx.textBaseline = "middle";
  ctx.fillText(name, x + size * 0.85, y + h / 2 + 1);
  if (tier) tick(ctx, tier, x + size * 0.85 + tw + size * 0.85, y + h / 2, size * 1.15);
  return w;
}

// A flat pill with the tier name in the tier's colour.
function tierChip(ctx, tier, x, y, size) {
  const name = tier.name.toUpperCase();
  ctx.font = `${size}px ${HEAVY}`;
  ctx.letterSpacing = `${size * 0.16}px`;
  const tw = ctx.measureText(name).width;
  const h = size * 2.3, w = tw + size * 2;
  const c = tier.card;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = tier.key === "obsidian" ? "#0e0f12" : c.mid;
  ctx.fill();
  if (tier.key === "obsidian") {
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#c9a24a";
    ctx.stroke();
  }
  ctx.fillStyle = tier.key === "obsidian" ? "#e9cf8a" : c.ink;
  ctx.textBaseline = "middle";
  ctx.fillText(name, x + size, y + h / 2 + 1);
  ctx.letterSpacing = "0px";
  return w;
}

// The verdict in solid colour. Returns its width.
function verdictWord(ctx, verdict, x, baseline, size) {
  const c = V[verdict];
  ctx.font = `${size}px ${HEAVY}`;
  ctx.letterSpacing = `${-size * 0.05}px`;
  ctx.textBaseline = "alphabetic";
  const w = ctx.measureText(verdict).width;
  ctx.fillStyle = c.main;
  ctx.fillText(verdict, x - size * 0.03, baseline);
  ctx.letterSpacing = "0px";
  return w;
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
    ctx.letterSpacing = `${-size * 0.015}px`;
    lines = wrap(ctx, said, maxW);
    if (lines.length <= maxLines) break;
  }
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s+\S*$/, "") + "…”";
  }
  const lh = size * 1.26;
  ctx.fillStyle = WHITE;
  ctx.textBaseline = "alphabetic";
  lines.forEach((line, i) => ctx.fillText(line, x, y + size + i * lh));
  ctx.letterSpacing = "0px";
  return y + size + (lines.length - 1) * lh;
}

// A ring gauge with the score in the middle, then a small label beside it. Older stamps without a score skip it.
function ring(ctx, verdict, score, cx, cy, R) {
  if (!(score >= 0)) return;
  const c = V[verdict];
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.lineWidth = R * 0.16;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.09)";
  ctx.stroke();
  ctx.beginPath();
  // Just short of a full turn: a closed arc can draw as nothing.
  ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.min(99.9, score)) / 100);
  ctx.lineCap = "round";
  ctx.strokeStyle = c.main;
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.font = `${R * 0.72}px ${HEAVY}`;
  ctx.letterSpacing = `${-R * 0.03}px`;
  ctx.fillStyle = WHITE;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(score), cx, cy + R * 0.04);
  ctx.letterSpacing = "0px";
  ctx.textAlign = "left";
}

const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function footer(ctx, r, x, y, right, size) {
  label(ctx, `STAMP #${String(r.number || 0).padStart(4, "0")}  ·  ${fmtDate(r.createdAt).toUpperCase()}`, x, y, size * 0.8, DIM);
  ctx.font = `${size}px ${BOLD}`;
  ctx.fillStyle = WHITE;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("stampmypage.com", right, y);
  ctx.textAlign = "left";
}

function scoreBlock(ctx, r, tier, x, cy, R) {
  if (!(r.score >= 0)) return;
  ring(ctx, r.verdict, r.score, x + R, cy, R);
  const lx = x + R * 2 + R * 0.55;
  label(ctx, "SCORE / 100", lx, cy - R * 0.18, R * 0.24);
  if (tier) tierChip(ctx, tier, lx, cy + R * 0.04, R * 0.26);
  else label(ctx, r.verdict === "COPE" ? `${80 - r.score} TO ALIVE` : "NOT YET", lx, cy + R * 0.42, R * 0.24, V[r.verdict].main);
}

function wide(shot, r) {
  const W = 1200, H = 630, M = 60;
  const c = createCanvas(W * SCALE, H * SCALE);
  const ctx = c.getContext("2d");
  ctx.scale(SCALE, SCALE);
  const tier = tierFor(r.verdict, r.score);
  ground(ctx, W, H);

  // Right: the first screen, tilted, with the seal on its corner.
  const fw = 500, fh = frameHeight(shot, fw, 420);
  frame(ctx, shot, r.host, 880, 300, fw, fh, -0.045);
  seal(ctx, r.verdict, r.score, r.number, 660, 300 + fh / 2 - 6, 74, -0.18);

  // Left.
  brand(ctx, M, 66, 30);
  label(ctx, "FIRST-SCREEN VERDICT", M, 136, 12);
  verdictWord(ctx, r.verdict, M, 250, 118);
  const bottom = quote(ctx, r.sentence, M, 276, 500, [27, 25, 23, 21], 3);
  const chipX = M + hostChip(ctx, r.host, tier, M, Math.min(bottom + 26, 440), 15);
  void chipX;
  scoreBlock(ctx, r, tier, M, 520, 34);

  footer(ctx, r, M, 600, W - M, 15);
  return c;
}

function square(shot, r) {
  const W = 1080, H = 1080, M = 72;
  const c = createCanvas(W * SCALE, H * SCALE);
  const ctx = c.getContext("2d");
  ctx.scale(SCALE, SCALE);
  const tier = tierFor(r.verdict, r.score);
  ground(ctx, W, H);

  brand(ctx, M, 80, 34);
  label(ctx, "FIRST-SCREEN VERDICT", W - M, 86, 13, SOFT, "right");

  const fw = 760, fh = frameHeight(shot, fw, 470);
  frame(ctx, shot, r.host, W / 2 + 40, 140 + fh / 2 + 20, fw, fh, -0.035);
  seal(ctx, r.verdict, r.score, r.number, W - 150, 140 + fh + 10, 92, 0.14);

  verdictWord(ctx, r.verdict, M, 790, 132);
  quote(ctx, r.sentence, M, 812, W - M * 2, [34, 32, 30, 28], 2);
  hostChip(ctx, r.host, tier, M, 920, 17);
  scoreBlock(ctx, r, tier, W - M - 290, 940, 36);

  footer(ctx, r, M, 1030, W - M, 17);
  return c;
}

// shot: the screenshot (no stamp, no sentence).
// r: { id?, verdict, sentence, host, createdAt, number, score? }. Returns JPEG buffers.
export async function renderCards(shot, r) {
  registerFonts();
  if (!MARK) MARK = await loadImage(path.join(process.cwd(), "public", "brand", "smp-mark-white.png"));
  const img = await loadImage(shot);
  return { wide: await wide(img, r).encode("jpeg", 92), square: await square(img, r).encode("jpeg", 92) };
}
