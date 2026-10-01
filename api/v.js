// Serves /v/:id. Same page as /v, with link-preview tags for this stamp so shared links show it.
import { escapeHtml, readResult, siteOrigin } from "./_lib.js";

export default async function handler(req, res) {
  const origin = siteOrigin(req);
  const id = String(req.query.id || "");
  let html;
  try {
    const page = await fetch(`${origin}/v`);
    html = await page.text();
  } catch (_) {
    return res.redirect(302, `/v?id=${encodeURIComponent(id)}`);
  }
  const r = await readResult(id);
  if (r) {
    const title = `${r.verdict}. Box looked at ${r.host}.`;
    const tags = [
      `<meta name="description" content="${escapeHtml(r.sentence)}" />`,
      `<meta property="og:title" content="${escapeHtml(title)}" />`,
      `<meta property="og:description" content="${escapeHtml(r.sentence)}" />`,
      `<meta property="og:image" content="${escapeHtml(r.image)}" />`,
      `<meta property="og:url" content="${escapeHtml(`${origin}/v/${r.id}`)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
    ].join("\n    ");
    html = html.replace("<!--result-meta-->", tags).replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)} — DEAD OR ALIVE</title>`);
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", r ? "public, s-maxage=60, stale-while-revalidate=600" : "no-store");
  res.status(r ? 200 : 404).send(html);
}
