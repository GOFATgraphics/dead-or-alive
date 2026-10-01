// Admin-only. Lists paid Polar orders for the stamp desk, with any stamp already published.
// Env: ADMIN_KEY, POLAR_ACCESS_TOKEN, BLOB_READ_WRITE_TOKEN.
// Optional: POLAR_API_BASE (sandbox), POLAR_ORGANIZATION_ID, SITE_URL.
import { list } from "@vercel/blob";
import { requireAdmin, resultId, siteOrigin } from "./_lib.js";

async function published() {
  const found = new Map();
  let cursor;
  do {
    const page = await list({ prefix: "verdicts/", limit: 1000, cursor });
    for (const b of page.blobs) if (b.pathname.endsWith(".json")) found.set(b.pathname.slice(9, -5), b.url);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return found;
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "GET only." });
  const token = process.env.POLAR_ACCESS_TOKEN;
  if (!token) return res.status(500).json({ error: "POLAR_ACCESS_TOKEN is not set." });

  const base = (process.env.POLAR_API_BASE || "https://api.polar.sh").replace(/\/$/, "");
  const url = new URL(base + "/v1/orders/");
  url.searchParams.set("limit", "100");
  url.searchParams.set("sorting", "-created_at");
  if (process.env.POLAR_ORGANIZATION_ID) url.searchParams.set("organization_id", process.env.POLAR_ORGANIZATION_ID);

  let body;
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    body = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: `Polar said ${r.status}.` });
  } catch (_) {
    return res.status(502).json({ error: "Polar did not answer." });
  }

  let stamps = new Map();
  let warning = "";
  try {
    stamps = await published();
  } catch (_) {
    warning = "Could not read published stamps. Is Vercel Blob connected?";
  }

  const origin = siteOrigin(req);
  const orders = await Promise.all(
    (body.items || []).map(async (o) => {
      const id = resultId(o.id);
      const jsonUrl = stamps.get(id);
      let verdict = "";
      if (jsonUrl) {
        try {
          verdict = (await (await fetch(jsonUrl, { cache: "no-store" })).json()).verdict || "";
        } catch (_) {}
      }
      return {
        id: o.id,
        createdAt: o.created_at,
        status: o.status || (o.paid ? "paid" : ""),
        product: (o.product && o.product.name) || "",
        amount: o.total_amount ?? o.amount ?? null,
        currency: o.currency || "usd",
        email: (o.customer && o.customer.email) || (o.user && o.user.email) || "",
        pageUrl: (o.custom_field_data && o.custom_field_data.page_url) || "",
        resultUrl: jsonUrl ? `${origin}/v/${id}` : "",
        verdict,
      };
    })
  );

  res.status(200).json({ orders, warning });
}
