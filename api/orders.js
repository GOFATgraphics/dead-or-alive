// Admin-only. Lists paid Polar orders for the stamp desk, with any stamp already published.
// Env: ADMIN_KEY, POLAR_ACCESS_TOKEN, BLOB_READ_WRITE_TOKEN.
// Optional: POLAR_API_BASE (sandbox), POLAR_ORGANIZATION_ID, SITE_URL.
import { fetchPolarOrders, publishedStamps, requireAdmin, resultId, siteOrigin } from "./_lib.js";
import { checkPageUrl } from "../src/url.js";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  if (req.method !== "GET") return res.status(405).json({ error: "GET only." });

  let items;
  try {
    items = await fetchPolarOrders();
  } catch (err) {
    return res.status(err.message.includes("not set") ? 500 : 502).json({ error: err.message });
  }

  let stamps = new Map();
  let warning = "";
  try {
    stamps = await publishedStamps();
  } catch (_) {
    warning = "Could not read published stamps. Is Vercel Blob connected?";
  }

  const origin = siteOrigin(req);
  const orders = await Promise.all(
    items.map(async (o) => {
      const id = resultId(o.id);
      const raw = String((o.custom_field_data && o.custom_field_data.page_url) || "").slice(0, 500);
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
        // Customers can edit this field on the checkout page, so check it again here.
        pageUrl: checkPageUrl(raw).url || "",
        pageUrlRaw: raw,
        resultUrl: jsonUrl ? `${origin}/v/${id}` : "",
        verdict,
      };
    })
  );

  res.status(200).json({ orders, warning });
}
