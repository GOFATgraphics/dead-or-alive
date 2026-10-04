// Draws a finished stamp on the server, the same way the desk editor does, for automatic publishing.
import path from "node:path";
import { GlobalFonts, createCanvas, loadImage } from "@napi-rs/canvas";
import { boxesToMarks, drawScene, layout } from "../src/stamp-draw.js";

let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  const dir = path.join(process.cwd(), "public", "fonts");
  GlobalFonts.registerFromPath(path.join(dir, "plus-jakarta-sans-latin-v12.woff2"), "Plus Jakarta Sans");
  GlobalFonts.registerFromPath(path.join(dir, "ibm-plex-mono-500-latin-v20.woff2"), "IBM Plex Mono");
  fontsReady = true;
}

// jpg: the screenshot. boxes: AI boxes in thousandths. Returns a JPEG buffer.
export async function renderStamp({ jpg, boxes, verdict, sentence }) {
  registerFonts();
  const image = await loadImage(jpg);
  const canvas = createCanvas(1, 1);
  const shotH = layout(canvas.getContext("2d"), image.width, image.height, sentence).shotH;
  drawScene(canvas, {
    image, imageW: image.width, imageH: image.height,
    marks: boxesToMarks(boxes, shotH), stamp: null, verdict, sentence,
  });
  return canvas.encode("jpeg", 88);
}
