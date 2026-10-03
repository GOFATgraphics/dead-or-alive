// Shared helpers for the API routes. Files starting with _ are not routes on Vercel.
import crypto from "node:crypto";
import { head, list } from "@vercel/blob";

export const VERDICTS = ["DEAD", "COPE", "ALIVE"];

function same(a, b) {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

// Wrong-key attempts per client IP. Memory lives per function instance, so this slows guessing
// rather than stopping it outright; the long random key is what actually protects the desk.
const MIN_KEY_LENGTH = 32;
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const fails = new Map();

function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || String(req.headers["x-real-ip"] || "") || req.socket?.remoteAddress || "unknown";
}

// Resolves true when the request carries the admin key. Otherwise answers and resolves false.
export async function requireAdmin(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  const adminKey = process.env.ADMIN_KEY || "";
  if (adminKey.length < MIN_KEY_LENGTH) {
    console.error(`Admin is off: ADMIN_KEY must be set and at least ${MIN_KEY_LENGTH} characters.`);
    res.status(503).json({ error: "Not available." });
    return false;
  }

  const ip = clientIp(req);
  const now = Date.now();
  let entry = fails.get(ip);
  if (entry && entry.reset <= now) {
    fails.delete(ip);
    entry = undefined;
  }
  if (entry && entry.count >= MAX_FAILS) {
    res.setHeader("Retry-After", String(Math.ceil((entry.reset - now) / 1000)));
    res.status(429).json({ error: "Too many wrong keys. Try again later." });
    return false;
  }

  if (!same(req.headers["x-admin-key"] || "", adminKey)) {
    if (!entry) fails.set(ip, (entry = { count: 0, reset: now + WINDOW_MS }));
    entry.count++;
    if (fails.size > 5000) fails.clear(); // keep memory bounded
    await new Promise((r) => setTimeout(r, 800));
    res.status(401).json({ error: "Wrong key." });
    return false;
  }
  fails.delete(ip);
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

// Paid orders from Polar, newest first. Throws an Error with a message for the admin.
export const polarReady = () => !!process.env.POLAR_ACCESS_TOKEN;

// Pass `since` (a Date) to keep paging back until orders are older than that, up to 10 pages.
export async function fetchPolarOrders({ since } = {}) {
  const token = process.env.POLAR_ACCESS_TOKEN;
  if (!token) throw new Error("POLAR_ACCESS_TOKEN is not set.");
  const base = (process.env.POLAR_API_BASE || "https://api.polar.sh").replace(/\/$/, "");
  const items = [];
  for (let page = 1; page <= (since ? 10 : 1); page++) {
    const url = new URL(base + "/v1/orders/");
    url.searchParams.set("limit", "100");
    url.searchParams.set("page", String(page));
    url.searchParams.set("sorting", "-created_at");
    if (process.env.POLAR_ORGANIZATION_ID) url.searchParams.set("organization_id", process.env.POLAR_ORGANIZATION_ID);
    let r;
    try {
      r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    } catch (_) {
      throw new Error("Polar did not answer.");
    }
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Polar said ${r.status}.`);
    const batch = body.items || [];
    items.push(...batch);
    const last = batch[batch.length - 1];
    const maxPage = body.pagination?.max_page ?? 1;
    if (!since || !last || page >= maxPage || new Date(last.created_at) < since) break;
  }
  return items;
}

// Result id -> URL of its JSON, for every published stamp.
export async function publishedStamps() {
  const found = new Map();
  let cursor;
  do {
    const page = await list({ prefix: "verdicts/", limit: 1000, cursor });
    for (const b of page.blobs) if (b.pathname.endsWith(".json")) found.set(b.pathname.slice(9, -5), b.url);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return found;
}

// An order still waiting on its stamp: paid, not refunded, nothing published.
// True for orders of the Verdict product, or for every order when POLAR_VERDICT_PRODUCT_ID isn't set.
// Keeps other products in the same Polar organization out of the desk, the queue, and analytics.
export function isVerdictOrder(order) {
  const product = process.env.POLAR_VERDICT_PRODUCT_ID;
  return !product || order.product_id === product || order.product?.id === product;
}

export function isWaiting(order, stamps) {
  const status = order.status || (order.paid ? "paid" : "");
  if (status !== "paid" || !isVerdictOrder(order)) return false;
  return !stamps.has(resultId(order.id));
}
