// Public. Downloads a stamp's share card as a file: /api/card?id=ID&size=wide|square
import { readResult } from "./_lib.js";

export default async function handler(req, res) {
  const r = await readResult(String(req.query.id || ""));
  const square = req.query.size === "square";
  const src = r && (square ? r.cardSquare : r.card);
  if (!src) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(404).json({ error: "No card for this stamp." });
  }
  const img = await fetch(src).catch(() => null);
  if (!img || !img.ok) return res.status(502).json({ error: "Could not load the card." });
  const name = `${r.host.replace(/[^a-z0-9.-]/gi, "")}-${r.verdict.toLowerCase()}${square ? "-square" : ""}.jpg`;
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.setHeader("Cache-Control", "public, s-maxage=300");
  res.status(200).send(Buffer.from(await img.arrayBuffer()));
}
