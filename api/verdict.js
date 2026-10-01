// Public. Returns one published stamp for the result page.
import { readResult } from "./_lib.js";

export default async function handler(req, res) {
  const r = await readResult(String(req.query.id || ""));
  if (!r) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(404).json({ error: "No stamp here." });
  }
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=600");
  res.status(200).json(r);
}
