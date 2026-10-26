// Public. The footer embed for one stamp, as SVG: /badge/<id> (steel), or ?theme=dark, gold, or light.
// Only an ALIVE stamp shows its tier and score; anything else shows the brand alone, so an embed never
// reveals a COPE or DEAD. Cached at the edge for an hour.
import { readResult } from "./_lib.js";
import { EMBED_THEMES, embedSvg, tierFor } from "../src/badge.js";

export default async function handler(req, res) {
  const r = await readResult(String(req.query.id || ""));
  const tier = r ? tierFor(r.verdict, r.score) : null;
  const theme = EMBED_THEMES.includes(req.query.theme) ? req.query.theme : "steel";
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Shown on other people's sites, so it has to be embeddable from anywhere.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
  res.status(200).send(embedSvg({ tier, score: tier ? r.score : 0, theme }));
}
