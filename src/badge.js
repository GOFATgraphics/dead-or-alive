// The status badges: tiers (G), the verified tick (D), and the footer embed (C), steel by default.
// Only ALIVE earns a status, split by score into Steel, Gold, and Obsidian. COPE is "on watch" and DEAD stays private.
// Everything here returns SVG strings, so the result page (as data: URIs) and /api/badge (as files) draw the same thing.

export const TIERS = {
  steel: {
    key: "steel", name: "Steel", min: 80, max: 87, line: "You're alive. It works.",
    card: { from: "#8e939b", mid: "#c9cdd3", to: "#9da2aa", ink: "#0e0f12", sub: "#2a2d33" },
    tick: { fill: "#c7cbd1", stroke: "#5b5e66", check: "#0e0f12" },
  },
  gold: {
    key: "gold", name: "Gold", min: 88, max: 95, line: "Sharp. Worth posting.",
    card: { from: "#b58a2e", mid: "#e9cf8a", to: "#c29a45", ink: "#1a1406", sub: "#3d2f0e" },
    tick: { fill: "#d9b45a", stroke: "#8a6a22", check: "#1a1406" },
  },
  obsidian: {
    key: "obsidian", name: "Obsidian", min: 96, max: 100, line: "Near perfect. Few pages get here.",
    card: { from: "#1c1e23", mid: "#0e0f12", to: "#23262c", ink: "#f1f2f4", sub: "#c7cbd1" },
    tick: { fill: "#0e0f12", stroke: "#c9a24a", check: "#e9cf8a" },
  },
};

// The tier a stamp earned, or null (COPE, DEAD, or an older stamp without a score).
export function tierFor(verdict, score) {
  if (verdict !== "ALIVE" || !(score >= 0)) return null;
  if (score >= TIERS.obsidian.min) return TIERS.obsidian;
  if (score >= TIERS.gold.min) return TIERS.gold;
  return TIERS.steel;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// The SMP roundel in one colour, drawn into a box at (x, y) of the given size.
const MARK = "M54.77 131.15L54.77 131.15Q50.2 131.79 45.94 130.69Q41.69 129.59 38.35 126.93Q35.01 124.26 32.98 120.28L32.98 120.28L40.76 115.39Q43.15 119.12 46.71 120.95Q50.27 122.79 54.19 122.23L54.19 122.23Q56.28 121.94 57.69 121.08Q59.1 120.21 59.79 118.95Q60.48 117.68 60.26 116.12L60.26 116.12Q60.02 114.42 58.8 113.35Q57.59 112.29 55.26 111.89L55.26 111.89L45.28 110.09Q39.2 109.01 35.77 105.93Q32.33 102.85 31.64 97.94L31.64 97.94Q31.04 93.63 32.7 90.06Q34.37 86.5 37.93 84.13Q41.5 81.76 46.47 81.06L46.47 81.06Q50.85 80.45 54.78 81.43Q58.72 82.41 61.82 84.77Q64.92 87.14 66.83 90.8L66.83 90.8L59.12 95.68Q57.27 92.48 54.25 90.93Q51.24 89.39 47.71 89.89L47.71 89.89Q45.68 90.17 44.2 91.05Q42.73 91.92 42.05 93.25Q41.37 94.58 41.59 96.15L41.59 96.15Q41.83 97.85 43.12 98.96Q44.41 100.08 46.73 100.49L46.73 100.49L56.5 102.18Q62.65 103.25 66.03 106.24Q69.42 109.23 70.11 114.13L70.11 114.13Q70.71 118.38 68.95 121.99Q67.19 125.61 63.56 128.01Q59.94 130.42 54.77 131.15M87.88 125.7L77.75 127.12L70.91 78.43L80.71 77.05L99.56 95.93L112.08 72.64L121.89 71.26L128.73 119.96L118.6 121.38L114.19 90.01L102.15 111.03L100.84 111.21L83.37 93.61L87.88 125.7M146 117.53L135.87 118.95L129.03 70.26L147.72 67.63Q152.75 66.93 156.89 68.14Q161.03 69.36 163.74 72.51Q166.45 75.67 167.16 80.76L167.16 80.76Q167.86 85.73 166.09 89.51Q164.32 93.29 160.69 95.64Q157.05 97.98 152.08 98.68L152.08 98.68L143.52 99.88L146 117.53M140.4 77.66L142.28 91.06L150.91 89.85Q153.07 89.54 154.52 88.47Q155.97 87.4 156.64 85.78Q157.31 84.15 157.03 82.19L157.03 82.19Q156.75 80.16 155.65 78.78Q154.56 77.4 152.87 76.77Q151.18 76.14 149.03 76.45L149.03 76.45L140.4 77.66";
function mark(x, y, size, color) {
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 200 200"><circle cx="100" cy="100" r="86" fill="none" stroke="${color}" stroke-width="15"/><path fill="${color}" d="${MARK}"/></svg>`;
}

// The scalloped verified mark: 12 points, a check inside.
const SCALLOP = "M50 0L61.1 8.5L75 6.7L80.4 19.6L93.3 25L91.5 38.9L100 50L91.5 61.1L93.3 75L80.4 80.4L75 93.3L61.1 91.5L50 100L38.9 91.5L25 93.3L19.6 80.4L6.7 75L8.5 61.1L0 50L8.5 38.9L6.7 25L19.6 19.6L25 6.7L38.9 8.5Z";
export function tickSvg(tier, size = 24) {
  const t = tier.tick;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-3 -3 106 106"><path d="${SCALLOP}" fill="${t.fill}" stroke="${t.stroke}" stroke-width="4" stroke-linejoin="round"/><path d="M31 51L45 64L70 37" fill="none" stroke="${t.check}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// The footer embed: mark, "Stamped on Stamp My Page", the status, and the score. 300 x 64.
// Without a tier (not ALIVE) it shows only the brand, so an embed never reveals a COPE or DEAD.
export const EMBED_THEMES = ["steel", "dark", "gold", "light"];
const EMBED = {
  steel: { bg: "url(#g)", border: "#5b5e66", ink: "#0e0f12", sub: "#2a2d33", mark: "#0e0f12", pillFill: "#0e0f12", pillStroke: "none", pillText: "#f1f2f4" },
  gold: { bg: "url(#g)", border: "#8a6a22", ink: "#1a1406", sub: "#4a3a12", mark: "#1a1406", pillFill: "#1a1406", pillStroke: "none", pillText: "#e9cf8a" },
  dark: { bg: "#0e0f12", border: "#c9a24a", ink: "#f1f2f4", sub: "#a9adb5", mark: "#c9a24a", pillFill: "none", pillStroke: "#c9a24a", pillText: "#e9cf8a" },
  light: { bg: "#ffffff", border: "#e2e3e6", ink: "#0e0f12", sub: "#5b5e66", mark: "#0e0f12", pillFill: "#0e0f12", pillStroke: "none", pillText: "#e9cf8a" },
};

// The footer embed: mark, "Stamped on Stamp My Page", the tick and status, and the score. 300 x 64.
// Steel is the default. Without a tier (not ALIVE) it shows only the brand, so an embed never reveals a COPE or DEAD.
export function embedSvg({ tier, score, theme = "steel" }) {
  const t = EMBED[theme] || EMBED.steel;
  const font = "font-family=\"'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif\"";
  const mono = "font-family=\"'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace\"";
  const title = tier ? `${tier.name} · Alive` : "Stamp My Page";
  const label = tier ? `Stamp My Page: ${tier.name}, alive, ${score} out of 100` : "Stamp My Page";
  const stops = { steel: ["#8e939b", "#d3d6db", "#9da2aa"], gold: ["#b58a2e", "#ecd38f", "#c29a45"] }[theme];
  const gradient = stops ? `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${stops[0]}"/><stop offset="0.5" stop-color="${stops[1]}"/><stop offset="1" stop-color="${stops[2]}"/></linearGradient></defs>` : "";
  const scorePill = tier
    ? `<rect x="236.5" y="18.5" width="47" height="27" rx="9" fill="${t.pillFill}" stroke="${t.pillStroke}"/><text x="260" y="37" text-anchor="middle" ${mono} font-size="14" font-weight="600" fill="${t.pillText}">${esc(score)}</text>`
    : "";
  const tick = tier ? `<g transform="translate(58 33) scale(0.17)"><path d="${SCALLOP}" fill="${tier.tick.fill}" stroke="${tier.tick.stroke}" stroke-width="6"/><path d="M31 51L45 64L70 37" fill="none" stroke="${tier.tick.check}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></g>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="64" viewBox="0 0 300 64" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>${gradient}<rect x="0.5" y="0.5" width="299" height="63" rx="14" fill="${t.bg}" stroke="${t.border}"/>${mark(16, 16, 32, t.mark)}<text x="58" y="27" ${mono} font-size="9" letter-spacing="1.4" fill="${t.sub}">STAMPED ON STAMP MY PAGE</text><text x="${tier ? 80 : 58}" y="47" ${font} font-size="17" font-weight="800" fill="${t.ink}">${esc(title)}</text>${tick}${scorePill}</svg>`;
}

export const svgUri = (svg) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
