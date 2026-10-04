// Admin-only. The AI draft for one order.
// GET ?order=ID returns the saved draft with its screenshot inlined, or { draft: null }.
// POST { orderId } takes a fresh screenshot, asks the AI, and saves the draft (replacing any earlier one).
import { fetchPolarOrder, orderPageUrl, polarReady, requireAdmin } from "./_lib.js";
import { aiReady, makeDraft, readDraft } from "./_ai.js";

async function withImage(draft) {
  if (!draft) return null;
  const r = await fetch(draft.image, { cache: "no-store" }).catch(() => null);
  if (!r || !r.ok) return { ...draft, imageData: "" };
  const b64 = Buffer.from(await r.arrayBuffer()).toString("base64");
  return { ...draft, imageData: `data:image/jpeg;base64,${b64}` };
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  if (req.method === "GET") {
    const id = String(req.query?.order || "");
    if (!id) return res.status(400).json({ error: "Missing order." });
    try {
      return res.status(200).json({ draft: await withImage(await readDraft(id)) });
    } catch (_) {
      return res.status(200).json({ draft: null });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "GET or POST." });
  if (!aiReady()) return res.status(503).json({ error: "AI drafts are off. Add ANTHROPIC_API_KEY in Vercel." });
  if (!polarReady()) return res.status(503).json({ error: "Polar isn't connected." });
  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const orderId = String(b.orderId || "");
  if (!orderId) return res.status(400).json({ error: "Missing order." });
  try {
    // The page URL comes from Polar, not the browser, so a draft always matches its order.
    const order = await fetchPolarOrder(orderId);
    if (!order) return res.status(404).json({ error: "Polar doesn't know this order." });
    const draft = await makeDraft(order.id, orderPageUrl(order));
    res.status(200).json({ draft: await withImage(draft) });
  } catch (err) {
    console.error("Draft failed:", err);
    res.status(502).json({ error: err.message || "Could not make the draft." });
  }
}
