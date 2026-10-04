// Draws a finished stamp: the screenshot, marker circles and scribbles, the stamp, and the sentence strip.
// Shared by the desk editor (browser canvas) and automatic publishing (server canvas), so both look the same.

export const COLORS = { DEAD: "#d92d33", COPE: "#c26a05", ALIVE: "#138a43" };
export const W = 1200;
const PAPER = "#ffffff";
const INK = "#12132a";
export const FONT = '"IBM Plex Mono", ui-monospace, monospace';
export const SANS = '"Plus Jakarta Sans", system-ui, sans-serif';

// Layout: the screenshot scaled to width W, then a strip with the sentence.
export function layout(ctx, imageW, imageH, sentence) {
  const shotH = Math.round(imageH * (W / imageW));
  const pad = 32;
  const font = 26;
  ctx.font = `500 ${font}px ${SANS}`;
  const lines = wrap(ctx, sentence.trim(), W - pad * 2);
  return { shotH, pad, font, lines, h: shotH + pad * 2 + lines.length * font * 1.5 };
}

function wrap(ctx, text, max) {
  const lines = [];
  let line = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const t = line ? line + " " + w : w;
    if (ctx.measureText(t).width > max && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export const markColor = (verdict) => (verdict === "ALIVE" ? COLORS.ALIVE : COLORS.DEAD);

// A marker circle: a little wobbly, overshoots where the pen started.
export function ellipsePath(ctx, m) {
  const cx = m.x + m.w / 2, cy = m.y + m.h / 2;
  const rx = Math.max(Math.abs(m.w) / 2, 2), ry = Math.max(Math.abs(m.h) / 2, 2);
  const start = -2.2 + (m.seed % 1) * 0.6;
  const turn = Math.PI * 2 * 1.07;
  ctx.beginPath();
  for (let i = 0; i <= 90; i++) {
    const t = start + (turn * i) / 90;
    const k = 1 + 0.035 * Math.sin(3 * t + m.seed * 7) + 0.04 * (i / 90);
    const x = cx + rx * k * Math.cos(t), y = cy + ry * k * Math.sin(t);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
}

export function penPath(ctx, m) {
  const p = m.points;
  ctx.beginPath();
  ctx.moveTo(p[0][0], p[0][1]);
  for (let i = 1; i < p.length - 1; i++) {
    const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
    ctx.quadraticCurveTo(p[i][0], p[i][1], mx, my);
  }
  const last = p[p.length - 1];
  ctx.lineTo(last[0], last[1]);
}

// Where the stamp sits. `stamp` is its centre, or null for the default bottom-right corner.
export function stampBox(ctx, L, verdict, stamp) {
  const fontSize = 44;
  ctx.font = `500 ${fontSize}px ${FONT}`;
  const spacing = fontSize * 0.14;
  const textW = [...verdict].reduce((a, ch) => a + ctx.measureText(ch).width, 0) + spacing * (verdict.length - 1);
  const w = textW + fontSize * 0.9, h = fontSize * 1.5;
  const c = stamp || { x: W - w / 2 - 36, y: L.shotH - h / 2 - 36 };
  return { v: verdict, fontSize, spacing, textW, w, h, x: c.x, y: c.y };
}

function drawStamp(ctx, s) {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate((-8 * Math.PI) / 180);
  ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
  ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
  ctx.strokeStyle = ctx.fillStyle = COLORS[s.v];
  ctx.lineWidth = 8;
  ctx.strokeRect(-s.w / 2, -s.h / 2, s.w, s.h);
  ctx.font = `500 ${s.fontSize}px ${FONT}`;
  ctx.textBaseline = "middle";
  let cx = -s.textW / 2;
  for (const ch of s.v) {
    ctx.fillText(ch, cx, 2);
    cx += ctx.measureText(ch).width + s.spacing;
  }
  ctx.restore();
}

// Sizes the canvas and draws everything. Returns the layout for callers that draw more on top.
export function drawScene(canvas, { image, imageW, imageH, marks, stamp, verdict, sentence }) {
  const ctx = canvas.getContext("2d");
  const L = layout(ctx, imageW, imageH, sentence);
  canvas.width = W;
  canvas.height = L.h;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, L.h);
  ctx.drawImage(image, 0, 0, W, L.shotH);

  ctx.save();
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.strokeStyle = markColor(verdict);
  for (const m of marks) {
    ctx.lineWidth = m.size;
    m.type === "ellipse" ? ellipsePath(ctx, m) : penPath(ctx, m);
    ctx.stroke();
  }
  ctx.restore();

  drawStamp(ctx, stampBox(ctx, L, verdict, stamp));

  ctx.fillStyle = "#e6e3f1";
  ctx.fillRect(0, L.shotH, W, 2);
  ctx.fillStyle = INK;
  ctx.font = `500 ${L.font}px ${SANS}`;
  ctx.textBaseline = "top";
  L.lines.forEach((line, i) => ctx.fillText(line, L.pad, L.shotH + L.pad + i * L.font * 1.5));
  return L;
}

// AI boxes (thousandths of the screenshot) become marker circles with a little breathing room.
export function boxesToMarks(boxes, shotH, size = 6) {
  return boxes
    .filter((b) => b.w > 0 && b.h > 0)
    .map((b, i) => ({
      type: "ellipse",
      x: (b.x / 1000) * W - 12,
      y: (b.y / 1000) * shotH - 10,
      w: (b.w / 1000) * W + 24,
      h: (b.h / 1000) * shotH + 20,
      seed: 0.37 + i * 0.29,
      size,
    }));
}
