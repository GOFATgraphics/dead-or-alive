// Public. One published stamp for the result page: verdict, score, screenshot, every check with its fix, the tech
// stack, speed, and SEO and security details. The same for everyone; a free account only saves it.
import { readResult } from "./_lib.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=60");
  const r = await readResult(String(req.query.id || ""));
  if (!r) return res.status(404).json({ error: "No stamp here." });
  res.status(200).json({ ...r, locked: false });
}
