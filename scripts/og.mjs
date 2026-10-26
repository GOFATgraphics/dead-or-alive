// Draws the site's own share card (public/og-card.png): what shows when someone shares stampmypage.com.
// Same look as the stamp cards. Run: node scripts/og.mjs
import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { brand, ground, label, loadMark, registerFonts, seal } from "../api/_card.js";

registerFonts();
await loadMark();
const W = 1200, H = 630, S = 2, M = 64;
const c = createCanvas(W * S, H * S);
const ctx = c.getContext("2d");
ctx.scale(S, S);
ground(ctx, W, H);

brand(ctx, M, 70, 32);
label(ctx, "FREE FIRST-SCREEN STAMP", M, 150, 13);

// The question, with the three verdicts in their colours.
const HEAVY = '"Plus Jakarta Sans ExtraBold"';
ctx.textBaseline = "alphabetic";
ctx.font = `62px ${HEAVY}`;
ctx.letterSpacing = "-2.5px";
ctx.fillStyle = "#f5f4f8";
ctx.fillText("Is your page", M, 232);
let x = M;
for (const [w, col] of [["DEAD", "#ff5a52"], [", ", "#f5f4f8"], ["COPE", "#ffb547"], [" or", "#f5f4f8"]]) {
  ctx.fillStyle = col;
  ctx.fillText(w, x, 302);
  x += ctx.measureText(w).width;
}
ctx.fillStyle = "#35d985";
ctx.fillText("ALIVE", M, 372);
ctx.fillStyle = "#f5f4f8";
ctx.fillText("?", M + ctx.measureText("ALIVE").width, 372);
ctx.letterSpacing = "0px";

ctx.font = `22px "Plus Jakarta Sans"`;
ctx.fillStyle = "#a3a1b3";
ctx.fillText("13 checks in 60 seconds, and the fix for every fail.", M, 432);

// Three seals, fanned.
seal(ctx, "DEAD", 41, 12, 880, 230, 92, -0.22);
seal(ctx, "COPE", 68, 57, 1040, 330, 92, 0.12);
seal(ctx, "ALIVE", 94, 7, 860, 440, 104, -0.06);

label(ctx, "FREE  ·  NO SIGNUP  ·  NO CARD", M, 572, 14, "#6e6c80");
ctx.font = `17px "Plus Jakarta Sans Bold"`;
ctx.fillStyle = "#f5f4f8";
ctx.textAlign = "right";
ctx.fillText("stampmypage.com", W - M, 572);

const png = await c.encode("png");
writeFileSync(new URL("../public/og-card.png", import.meta.url), png);
writeFileSync(new URL("../public/brand/og-image-1200x630.png", import.meta.url), png);
console.log("og image", png.length);
