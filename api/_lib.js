// Shared helpers for the API routes. Files starting with _ are not routes on Vercel.
import crypto from "node:crypto";
import { head } from "@vercel/blob";

export const VERDICTS = ["DEAD", "COPE", "ALIVE"];

function same(a, b) {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

// Returns true when the request carries the admin key. Otherwise answers and returns false.
export function requireAdmin(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    res.status(500).json({ error: "ADMIN_KEY is not set." });
    return false;
  }
  if (!same(req.headers["x-admin-key"] || "", adminKey)) {
    res.status(401).json({ error: "Wrong key." });
    return false;
  }
  return true;
}

// Result IDs are derived from the Polar order ID, so republishing an order replaces its stamp
// and nobody can guess another customer's link.
export function resultId(orderId) {
  const secret = process.env.RESULT_SECRET || process.env.ADMIN_KEY;
  return crypto.createHmac("sha256", secret).update(String(orderId)).digest("base64url").slice(0, 12);
}

export function isResultId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{6,40}$/.test(id);
}

export const paths = (id) => ({ json: `verdicts/${id}.json`, image: `verdicts/${id}.jpg` });

// The public verdict record, or null.
export async function readResult(id) {
  if (!isResultId(id)) return null;
  try {
    const meta = await head(paths(id).json);
    const r = await fetch(meta.url, { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch (_) {
    return null;
  }
}

export function siteOrigin(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
