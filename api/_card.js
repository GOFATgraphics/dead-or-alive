// Share cards: the stamp as an image people post. Wide (1200x630, the link-preview size on X and
// LinkedIn) and square (1080x1080 for Instagram and LinkedIn posts).
// Hero: the circled first screen. Across it: the stamp. Then the sentence, domain, date, stamp number,
// and stampmypage.com so every share points back here.
import path from "node:path";
import { GlobalFonts, createCanvas, loadImage } from "@napi-rs/canvas";
import { COLORS } from "../src/stamp-draw.js";

const BG = "#f6f5fc";
const INK = "#12132a";
const MUTED = "#5d6180";
const LINE = "#e2def2";
const SANS = '"Plus Jakarta Sans"';
const BOLD = '"Plus Jakarta Sans ExtraBold"';
const MONO = '"IBM Plex Mono"';

let fontsReady = false;
export function registerFonts() {
  if (fontsReady) return;
  const pub = path.join(process.cwd(), "public", "fonts");
  GlobalFonts.registerFromPath(path.join(pub, "plus-jakarta-sans-latin-v12.woff2"), "Plus Jakarta Sans");
  GlobalFonts.registerFromPath(path.join(pub, "ibm-plex-mono-500-latin-v20.woff2"), "IBM Plex Mono");
  GlobalFonts.registerFromPath(path.join(process.cwd(), "server-fonts", "plus-jakarta-sans-800.woff2"), "Plus Jakarta Sans ExtraBold");
  fontsReady = true;
}

function wrap(ctx, text, max, maxLines) {
  const lines = [];
  let line = "";
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > max && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > max && last.includes(" ")) last = last.slice(0, last.lastIndexOf(" "));
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines;
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

// The screenshot in a rounded frame, cropped from the top to fill the box.
function drawHero(ctx, shot, x, y, w, h) {
  ctx.save();
  ctx.shadowColor = "rgba(40, 30, 110, 0.18)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, x, y, w, h, 18);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, x, y, w, h, 18);
  ctx.clip();
  const scale = Math.max(w / shot.width, h / shot.height);
  const sw = w / scale, sh = h / scale;
  ctx.drawImage(shot, (shot.width - sw) / 2, 0, sw, sh, x, y, w, h);
  ctx.restore();
  ctx.save();
  roundRect(ctx, x, y, w, h, 18);
  ctx.lineWidth = 2;
  ctx.strokeStyle = LINE;
  ctx.stroke();
  ctx.restore();
}

// The rubber stamp, big and tilted, like it was thumped onto the page.
function drawStamp(ctx, verdict, cx, cy, size) {
  const color = COLORS[verdict];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-9 * Math.PI) / 180);
  ctx.font = `500 ${size}px ${MONO}`;
  const spacing = size * 0.14;
  const textW = [...verdict].reduce((a, ch) => a + ctx.measureText(ch).width, 0) + spacing * (verdict.length - 1);
  const w = textW + size * 1.0, h = size * 1.55;
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.lineWidth = Math.max(6, size * 0.12);
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.lineWidth = Math.max(2, size * 0.035);
  ctx.strokeRect(-w / 2 + size * 0.16, -h / 2 + size * 0.16, w - size * 0.32, h - size * 0.32);
  ctx.textBaseline = "middle";
  let x = -textW / 2;
  for (const ch of verdict) {
    ctx.fillText(ch, x, size * 0.05);
    x += ctx.measureText(ch).width + spacing;
  }
  ctx.restore();
}

// Box's ears over a violet tile, as in the site logo.
function drawLogo(ctx, x, y, s) {
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

function brand(ctx, x, y, size, align = "left") {
  ctx.font = `600 ${size}px ${SANS}`;
  const text = "stampmypage.com";
  const tw = ctx.measureText(text).width;
  const logo = size * 1.5;
  const start = align === "right" ? x - tw - logo - size * 0.5 : x;
  drawLogo(ctx, start, y - logo / 2, logo);
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  ctx.fillText(text, start + logo + size * 0.5, y + 1);
}

const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmtNumber = (n) => `#${String(n).padStart(4, "0")}`;

function wide(shot, r) {
  const c = createCanvas(1200, 630);
  const ctx = c.getContext("2d");
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = COLORS[r.verdict];
  ctx.fillRect(0, 0, 1200, 8);

  // Hero on the left, 16:10 like a laptop screen.
  drawHero(ctx, shot, 40, 48, 704, 440);
  drawStamp(ctx, r.verdict, 600, 410, 58);

  // The sentence under the hero.
  ctx.fillStyle = INK;
  ctx.font = `500 25px ${SANS}`;
  ctx.textBaseline = "top";
  wrap(ctx, r.sentence, 704, 2).forEach((line, i) => ctx.fillText(line, 40, 512 + i * 34));

  // Facts on the right.
  const x = 784, w = 376;
  ctx.fillStyle = MUTED;
  ctx.font = `500 15px ${MONO}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("WE LOOKED AT", x, 88);
  ctx.fillStyle = INK;
  let size = 34;
  ctx.font = `${size}px ${BOLD}`;
  while (ctx.measureText(r.host).width > w && size > 18) ctx.font = `${--size}px ${BOLD}`;
  ctx.fillText(r.host, x, 130);

  ctx.fillStyle = COLORS[r.verdict];
  ctx.font = `96px ${BOLD}`;
  ctx.fillText(r.verdict, x - 4, 250);

  ctx.fillStyle = MUTED;
  ctx.font = `500 18px ${MONO}`;
  ctx.fillText(`STAMP ${fmtNumber(r.number)}`, x, 310);
  ctx.fillText(fmtDate(r.createdAt).toUpperCase(), x, 340);

  ctx.fillStyle = LINE;
  ctx.fillRect(x, 520, w, 2);
  brand(ctx, x, 568, 22);
  return c;
}

function square(shot, r) {
  const c = createCanvas(1080, 1080);
  const ctx = c.getContext("2d");
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, 1080, 1080);
  ctx.fillStyle = COLORS[r.verdict];
  ctx.fillRect(0, 0, 1080, 10);

  ctx.fillStyle = MUTED;
  ctx.font = `500 22px ${MONO}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("WE LOOKED AT", 60, 92);
  ctx.fillStyle = INK;
  let size = 46;
  ctx.font = `${size}px ${BOLD}`;
  while (ctx.measureText(r.host).width > 960 && size > 24) ctx.font = `${--size}px ${BOLD}`;
  ctx.fillText(r.host, 60, 148);

  drawHero(ctx, shot, 60, 190, 960, 600);
  drawStamp(ctx, r.verdict, 790, 700, 84);

  ctx.fillStyle = INK;
  ctx.font = `500 32px ${SANS}`;
  ctx.textBaseline = "top";
  wrap(ctx, r.sentence, 960, 2).forEach((line, i) => ctx.fillText(line, 60, 826 + i * 44));

  ctx.fillStyle = LINE;
  ctx.fillRect(60, 942, 960, 2);
  ctx.fillStyle = MUTED;
  ctx.font = `500 22px ${MONO}`;
  ctx.textBaseline = "middle";
  ctx.fillText(`STAMP ${fmtNumber(r.number)} · ${fmtDate(r.createdAt).toUpperCase()}`, 60, 1000);
  brand(ctx, 1020, 1000, 26, "right");
  return c;
}

// shot: JPEG/PNG buffer of the circled screenshot (no stamp, no sentence).
// r: { verdict, sentence, host, createdAt, number }. Returns PNG buffers.
export async function renderCards(shot, r) {
  registerFonts();
  const img = await loadImage(shot);
  return { wide: await wide(img, r).encode("png"), square: await square(img, r).encode("png") };
}
