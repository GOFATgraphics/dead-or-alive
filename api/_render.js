// Draws a finished stamp on the server, the same way the desk editor does, for automatic publishing.
import path from "node:path";
import { GlobalFonts, createCanvas, loadImage } from "@napi-rs/canvas";
import { boxesToMarks, drawScene, drawShot, layout } from "../src/stamp-draw.js";

let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  const dir = path.join(process.cwd(), "public", "fonts");
  GlobalFonts.registerFromPath(path.join(dir, "plus-jakarta-sans-latin-v12.woff2"), "Plus Jakarta Sans");
  GlobalFonts.registerFromPath(path.join(dir, "ibm-plex-mono-500-latin-v20.woff2"), "IBM Plex Mono");
  fontsReady = true;
}

// jpg: the screenshot. boxes: AI boxes in thousandths.
// Returns { image, shot }: the finished stamp, and the circled screenshot alone for the share cards (JPEGs).
export async function renderStamp({ jpg, boxes, verdict, sentence }) {
  registerFonts();
  const image = await loadImage(jpg);
  const canvas = createCanvas(1, 1);
  const shotH = layout(canvas.getContext("2d"), image.width, image.height, sentence).shotH;
  const marks = boxesToMarks(boxes, shotH);
  drawScene(canvas, { image, imageW: image.width, imageH: image.height, marks, stamp: null, verdict, sentence });
  const shotCanvas = createCanvas(1, 1);
  drawShot(shotCanvas, { image, imageW: image.width, imageH: image.height, marks, verdict });
  return { image: await canvas.encode("jpeg", 88), shot: await shotCanvas.encode("jpeg", 88) };
}
