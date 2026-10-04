// Public. The payment page polls this with the checkout id Polar put in its URL, and opens the stamp when it's ready.
// The checkout id is only known to the buyer, so it stands in for a login.
import { polarOrderForCheckout, readResult, resultId } from "./_lib.js";
import { draftFor } from "./_ai.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const checkoutId = String(req.query.checkout_id || "");
  if (!UUID.test(checkoutId)) return res.status(400).json({ error: "Missing checkout." });
  let order;
  try {
    order = await polarOrderForCheckout(checkoutId);
  } catch (_) {
    return res.status(200).json({ state: "working" });
  }
  // Polar creates the order a moment after the redirect.
  if (!order) return res.status(200).json({ state: "working" });
  const id = resultId(order.id);
  if (await readResult(id)) return res.status(200).json({ state: "ready", url: `/v/${id}` });
  const status = order.status || "";
  if (status === "refunded" || status === "partially_refunded") return res.status(200).json({ state: "refunded" });
  const draft = await draftFor(id);
  if (draft?.refunded?.ok) return res.status(200).json({ state: "refunded" });
  if (draft?.failed && draft.refunded) return res.status(200).json({ state: "failed" });
  res.status(200).json({ state: "working" });
}
