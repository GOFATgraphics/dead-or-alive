// Admin-only. Lists paid Polar orders for the stamp desk.
// Env: ADMIN_KEY, POLAR_ACCESS_TOKEN. Optional: POLAR_API_BASE (sandbox), POLAR_ORGANIZATION_ID.
const crypto = require("crypto");

function same(a, b) {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  if (req.method !== "GET") return res.status(405).json({ error: "GET only." });

  const adminKey = process.env.ADMIN_KEY;
  const token = process.env.POLAR_ACCESS_TOKEN;
  if (!adminKey || !token) return res.status(500).json({ error: "ADMIN_KEY or POLAR_ACCESS_TOKEN is not set." });
  if (!same(req.headers["x-admin-key"] || "", adminKey)) return res.status(401).json({ error: "Wrong key." });

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

  const orders = (body.items || []).map((o) => ({
    id: o.id,
    createdAt: o.created_at,
    status: o.status || (o.paid ? "paid" : ""),
    product: (o.product && o.product.name) || "",
    amount: o.total_amount ?? o.amount ?? null,
    currency: o.currency || "usd",
    email: (o.customer && o.customer.email) || (o.user && o.user.email) || "",
    pageUrl: (o.custom_field_data && o.custom_field_data.page_url) || "",
  }));

  res.status(200).json({ orders });
};
