// Builds the Stamp My Page brand pack: the ink roundel, lockups, red seal, favicons, app icons,
// the web manifest, and the 1200x630 link preview. All text is outlined, so the files render the
// same everywhere without the fonts installed.
//
//   node scripts/brand/build.mjs
//
// Writes public/brand/* and the favicon set in public/. Commit the output; Vercel doesn't run this.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import { Resvg } from "@resvg/resvg-js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const pub = path.join(root, "public");
const out = path.join(pub, "brand");
fs.mkdirSync(out, { recursive: true });

const font = (n) => opentype.parse(fs.readFileSync(path.join(here, "fonts", n)).buffer);
const HEAVY = font("jakarta-800.woff");
const MONO = font("plex-mono-500.woff");

export const BRAND = {
  ink: "#4B2EE0",
  text: "#12132A",
  seal: "#B42228",
  lavender: "#F4F1FF",
  inkOnDark: "#A994FF",
  subline: "#B9A8FF",
  night: "#14112E",
};

const f2 = (n) => Math.round(n * 100) / 100;

// One glyph's outline, moved and turned by a 2D transform (a, b, c, d, e, f).
function glyphPath(f, ch, size, m) {
  const g = f.charToGlyph(ch);
  const p = g.getPath(0, 0, size);
  const T = (x, y) => [f2(m[0] * x + m[2] * y + m[4]), f2(m[1] * x + m[3] * y + m[5])];
  let d = "";
  for (const c of p.commands) {
    if (c.type === "M" || c.type === "L") d += c.type + T(c.x, c.y).join(" ");
    else if (c.type === "Q") d += "Q" + [...T(c.x1, c.y1), ...T(c.x, c.y)].join(" ");
    else if (c.type === "C") d += "C" + [...T(c.x1, c.y1), ...T(c.x2, c.y2), ...T(c.x, c.y)].join(" ");
    else if (c.type === "Z") d += "Z";
  }
  return { d, adv: (g.advanceWidth / f.unitsPerEm) * size };
}

const advance = (f, ch, size) => (f.charToGlyph(ch).advanceWidth / f.unitsPerEm) * size;
const textWidth = (f, s, size, track = 0) => [...s].reduce((w, ch) => w + advance(f, ch, size) + track, 0) - track;

// Straight text: x is the left edge, y the baseline, rotation in degrees about (cx, cy).
function textPath(f, s, size, { x = 0, y = 0, track = 0, rot = 0, cx = 0, cy = 0 } = {}) {
  const r = (rot * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
  let d = "", pen = x;
  for (const ch of s) {
    const px = pen - cx, py = y - cy;
    const tx = cx + px * cos - py * sin, ty = cy + px * sin + py * cos;
    d += glyphPath(f, ch, size, [cos, sin, -sin, cos, tx, ty]).d;
    pen += advance(f, ch, size) + track;
  }
  return d;
}

// Text around a circle. Top: reads clockwise, letters point outward. Bottom: reads left to right,
// letters point to the centre. `radius` is the baseline circle.
function arcText(f, s, size, cx, cy, radius, { bottom = false, track = 0 } = {}) {
  const total = textWidth(f, s, size, track);
  const span = total / radius;
  let d = "";
  let along = 0;
  for (const ch of s) {
    const w = advance(f, ch, size);
    const mid = along + w / 2;
    const theta = bottom ? Math.PI / 2 + span / 2 - mid / radius : -Math.PI / 2 - span / 2 + mid / radius;
    const rot = bottom ? theta - Math.PI / 2 : theta + Math.PI / 2;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const px = cx + radius * Math.cos(theta), py = cy + radius * Math.sin(theta);
    // Move the glyph so its centre sits on the point, then turn it.
    const ox = -w / 2;
    d += glyphPath(f, ch, size, [cos, sin, -sin, cos, px + ox * cos, py + ox * sin]).d;
    along += w + track;
  }
  return d;
}

function star(cx, cy, r) {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    d += (i ? "L" : "M") + f2(cx + rr * Math.cos(a)) + " " + f2(cy + rr * Math.sin(a));
  }
  return d + "Z";
}

const TILT = -8;

// The roundel in a 200x200 box: outer ring, arc text, stars, inner ring, banded SMP.
function roundel(color, { x = 0, y = 0, s = 1 } = {}) {
  const cx = 100, cy = 100;
  const smpSize = 60;
  const smpW = textWidth(HEAVY, "SMP", smpSize, -1);
  const smp = textPath(HEAVY, "SMP", smpSize, { x: cx - smpW / 2, y: cy + smpSize * 0.36, track: -1, rot: TILT, cx, cy });
  const band = (dy) => {
    const r = (TILT * Math.PI) / 180;
    const len = 150, x1 = -len / 2, x2 = len / 2;
    const P = (px) => [f2(cx + px * Math.cos(r) - dy * Math.sin(r)), f2(cy + px * Math.sin(r) + dy * Math.cos(r))];
    return `M${P(x1).join(" ")}L${P(x2).join(" ")}`;
  };
  const id = `c${Math.random().toString(36).slice(2, 7)}`;
  return `<g transform="translate(${x} ${y}) scale(${s})" fill="none">
  <defs><clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="64.5"/></clipPath></defs>
  <circle cx="${cx}" cy="${cy}" r="93" stroke="${color}" stroke-width="7"/>
  <circle cx="${cx}" cy="${cy}" r="66" stroke="${color}" stroke-width="3.5"/>
  <path fill="${color}" d="${arcText(MONO, "STAMP MY PAGE", 15.5, cx, cy, 72.5, { track: 3.2 })}"/>
  <path fill="${color}" d="${arcText(MONO, "FIRST-SCREEN VERDICT", 14, cx, cy, 82, { bottom: true, track: 1.6 })}"/>
  <path fill="${color}" d="${star(cx - 79.5, cy, 4.6)}${star(cx + 79.5, cy, 4.6)}"/>
  <g clip-path="url(#${id})" stroke="${color}" stroke-width="4.5" stroke-linecap="butt"><path d="${band(-29)}"/><path d="${band(29)}"/></g>
  <path fill="${color}" d="${smp}"/>
</g>`;
}

// The simple mark for small sizes: one thick ring and SMP. `filled` swaps to a solid disc.
function mark(color, { filled = false, fg = "#ffffff", x = 0, y = 0, s = 1 } = {}) {
  const cx = 100, cy = 100, size = 66;
  const w = textWidth(HEAVY, "SMP", size, -1.5);
  const smp = textPath(HEAVY, "SMP", size, { x: cx - w / 2, y: cy + size * 0.36, track: -1.5, rot: TILT, cx, cy });
  return `<g transform="translate(${x} ${y}) scale(${s})">
  ${filled ? `<circle cx="${cx}" cy="${cy}" r="96" fill="${color}"/>` : `<circle cx="${cx}" cy="${cy}" r="86" fill="none" stroke="${color}" stroke-width="15"/>`}
  <path fill="${filled ? fg : color}" d="${smp}"/>
</g>`;
}

const svg = (w, h, body, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ""}${body}</svg>\n`;

function lockup(dark) {
  const ink = dark ? BRAND.inkOnDark : BRAND.ink;
  const word = textPath(HEAVY, "STAMP MY PAGE", 58, { x: 232, y: 112, track: 0.5 });
  const sub = textPath(MONO, "FIRST-SCREEN VERDICTS", 19, { x: 234, y: 152, track: 5.2 });
  return svg(820, 200, `${roundel(ink)}<path fill="${dark ? "#ffffff" : BRAND.text}" d="${word}"/><path fill="${dark ? BRAND.subline : BRAND.ink}" d="${sub}"/>`, dark ? BRAND.night : null);
}

function png(svgText, width, file) {
  const r = new Resvg(svgText, { fitTo: { mode: "width", value: width }, background: "rgba(0,0,0,0)" });
  const buf = r.render().asPng();
  fs.writeFileSync(file, buf);
  return buf;
}

// ICO holding PNG images (supported by every current browser).
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(([size, buf], i) => {
    const o = 6 + i * 16;
    head.writeUInt8(size >= 256 ? 0 : size, o);
    head.writeUInt8(size >= 256 ? 0 : size, o + 1);
    head.writeUInt16LE(1, o + 4);
    head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(buf.length, o + 8);
    head.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([head, ...pngs.map(([, b]) => b)]);
}

// --- Logos
const files = {
  "smp-icon.svg": svg(200, 200, roundel(BRAND.ink)),
  "smp-icon-dark.svg": svg(200, 200, roundel(BRAND.inkOnDark)),
  "smp-seal-red.svg": svg(200, 200, roundel(BRAND.seal)),
  "smp-mark.svg": svg(200, 200, mark(BRAND.ink)),
  "smp-lockup.svg": lockup(false),
  "smp-lockup-dark.svg": lockup(true),
};
for (const [name, text] of Object.entries(files)) {
  fs.writeFileSync(path.join(out, name), text);
  png(text, name.includes("lockup") ? 1640 : 512, path.join(out, name.replace(".svg", ".png")));
}
// Small raster copies for places that can't take SVG (the server-drawn share cards).
png(files["smp-seal-red.svg"], 256, path.join(out, "smp-seal-red-256.png"));
png(files["smp-icon.svg"], 256, path.join(out, "smp-icon-256.png"));

// --- Favicons and app icons
const fav = svg(200, 200, mark(BRAND.ink));
fs.writeFileSync(path.join(pub, "favicon.svg"), fav);
const tiny = svg(200, 200, mark(BRAND.ink, { filled: true }));
const p16 = png(tiny, 16, path.join(pub, "favicon-16.png"));
const p32 = png(fav, 32, path.join(pub, "favicon-32.png"));
const p48 = png(fav, 48, path.join(out, "favicon-48.png"));
fs.writeFileSync(path.join(pub, "favicon.ico"), ico([[16, p16], [32, p32], [48, p48]]));
// Apple and Android: lavender tile, mark inside the safe zone (iOS rounds the corners itself).
png(svg(200, 200, mark(BRAND.ink, { x: 30, y: 30, s: 0.7 }), BRAND.lavender), 180, path.join(pub, "apple-touch-icon.png"));
png(svg(200, 200, mark(BRAND.ink, { x: 26, y: 26, s: 0.74 }), BRAND.lavender), 192, path.join(pub, "icon-192.png"));
// Maskable: the roundel within the 80% safe circle.
png(svg(200, 200, roundel(BRAND.ink, { x: 28, y: 28, s: 0.72 }), BRAND.lavender), 512, path.join(pub, "icon-512.png"));

fs.writeFileSync(
  path.join(pub, "site.webmanifest"),
  JSON.stringify(
    {
      name: "Stamp My Page",
      short_name: "Stamp My Page",
      description: "First-screen verdicts. DEAD, COPE, or ALIVE for $1.",
      start_url: "/",
      display: "standalone",
      background_color: BRAND.lavender,
      theme_color: BRAND.ink,
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    },
    null,
    2
  ) + "\n"
);

// --- Link preview, 1200x630
const og = svg(
  1200,
  630,
  `<defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F4F1FF"/><stop offset="1" stop-color="#E9E0FF"/></linearGradient>
    <radialGradient id="b1" cx="0.62" cy="0.18" r="0.45"><stop offset="0" stop-color="#C9B8FF" stop-opacity="0.75"/><stop offset="1" stop-color="#C9B8FF" stop-opacity="0"/></radialGradient>
    <radialGradient id="b2" cx="0.1" cy="0.95" r="0.4"><stop offset="0" stop-color="#D8C8FF" stop-opacity="0.7"/><stop offset="1" stop-color="#D8C8FF" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/><rect width="1200" height="630" fill="url(#b1)"/><rect width="1200" height="630" fill="url(#b2)"/>
  ${roundel(BRAND.ink, { x: 168, y: 200, s: 1.08 })}
  <path fill="${BRAND.text}" d="${textPath(HEAVY, "STAMP MY PAGE", 76, { x: 432, y: 318, track: 0.5 })}"/>
  <path fill="${BRAND.ink}" d="${textPath(MONO, "FIRST-SCREEN VERDICTS", 26, { x: 436, y: 372, track: 7.5 })}"/>
  <path fill="${BRAND.ink}" d="${(() => { const s = "$1 · STAMPMYPAGE.COM"; const w = textWidth(MONO, s, 22, 6); return textPath(MONO, s, 22, { x: 600 - w / 2, y: 560, track: 6 }); })()}"/>`
);
fs.writeFileSync(path.join(out, "og-image-1200x630.svg"), og);
const ogPng = new Resvg(og, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
fs.writeFileSync(path.join(out, "og-image-1200x630.png"), ogPng);
fs.writeFileSync(path.join(pub, "og-image-1200x630.png"), ogPng);

console.log("Brand pack written to public/brand and public/.");
