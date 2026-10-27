// Polar: checkout links that carry the account's email and id, the webhook events that switch a membership on
// or off, and cancelling Stay Alive. Payment is matched to the account by its id (reference_id), then by email.
// Env: POLAR_WEBHOOK_SECRET (required for the webhook). Optional: POLAR_ACCESS_TOKEN (confirms a checkout the
// moment the buyer lands back, and cancels from the dashboard), POLAR_API_BASE (sandbox).
import crypto from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { CHECKOUT } from "./_plans.js";
import { emailForId, ensureUser, getUser, hasStayAlive, updateUser } from "./_account.js";
import { addTo } from "./_store.js";
import { runScout } from "./_scout.js";
import { runMonitor } from "./_monitor.js";
import { checkPageUrl } from "../src/url.js";

const base = () => (process.env.POLAR_API_BASE || "https://api.polar.sh").replace(/\/$/, "");
const token = () => process.env.POLAR_ACCESS_TOKEN || "";
export const polarApiReady = () => !!token();

async function polar(path, { method = "GET", body } = {}) {
  const r = await fetch(base() + path, {
    method,
    headers: { Authorization: `Bearer ${token()}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Polar said ${r.status}.`);
  return data;
}

// Which plan a product is. Stay Alive has a monthly and a yearly product.
const planOf = (productId) => Object.keys(CHECKOUT).find((k) => CHECKOUT[k].productId === productId || CHECKOUT[k].yearly?.productId === productId) || "";

// The Polar checkout for a plan, with the account's email filled in and its id attached. Checkout only takes the
// payment: the page to stamp or watch is already saved on the account (pendingUrl), or added in the dashboard after.
export function checkoutUrl(plan, user, pageUrl, yearly = false) {
  const u = new URL(((yearly && CHECKOUT[plan].yearly) || CHECKOUT[plan]).url);
  u.searchParams.set("customer_email", user.email);
  u.searchParams.set("reference_id", user.id);
  return u.toString();
}

// Standard Webhooks: HMAC-SHA256 over "id.timestamp.body", keyed with the secret's UTF-8 bytes (as Polar's SDK does).
export function verifyWebhook(headers, body, secret) {
  const h = (k) => headers[k] || headers.get?.(k) || "";
  const id = h("webhook-id"), ts = h("webhook-timestamp"), sigs = h("webhook-signature");
  if (!id || !ts || !sigs || !secret) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = crypto.createHmac("sha256", Buffer.from(secret, "utf8")).update(`${id}.${ts}.${body}`).digest();
  return String(sigs).split(" ").some((entry) => {
    const [version, sig] = entry.split(",");
    if (version !== "v1" || !sig) return false;
    const got = Buffer.from(sig, "base64");
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
}

// Which account a Polar object belongs to: our id first, then the email. An unknown email gets an account,
// so a payment is never orphaned; whoever signs in with that email finds it.
async function ownerOf(obj) {
  const ref = obj?.metadata?.reference_id || obj?.customer?.external_id || obj?.external_customer_id;
  const byId = ref ? await emailForId(ref) : null;
  if (byId) return byId;
  const email = obj?.customer?.email || obj?.customer_email;
  return email ? (await ensureUser(email)).email : "";
}

const pageFrom = (obj, user) => checkPageUrl(obj?.custom_field_data?.page_url || "").url || user?.pendingUrl || "";

// Kill Sheet bought: switch it on and start the scout. A repeat of the same purchase (webhook retry, or the
// buyer landing back before the webhook) changes nothing.
export async function activateKillSheet(email, { orderId = "", checkoutId = "", pageUrl = "" }) {
  let start = false, url = pageUrl;
  await updateUser(email, (u) => {
    if (!u) return undefined;
    const ks = u.killSheet;
    const same = ks && ((orderId && ks.orderId === orderId) || (checkoutId && ks.checkoutId === checkoutId));
    if (same) {
      u.killSheet = { ...ks, orderId: ks.orderId || orderId, checkoutId: ks.checkoutId || checkoutId };
      return u;
    }
    url = pageUrl || ks?.url || u.pendingUrl || "";
    u.killSheet = { since: new Date().toISOString(), orderId, checkoutId, url, restampsLeft: (ks?.restampsLeft || 0) + 1, refunded: false };
    start = !!url;
    return u;
  });
  // The scout takes about a minute: it runs after the answer, so the buyer sees the plan on right away.
  if (start) waitUntil(runScout(email, url).catch((e) => console.error("Scout failed:", e)));
}

// Stay Alive changed: keep the status and dates, and on the first activation switch monitoring on with a re-stamp.
export async function syncStayAlive(email, sub, pageUrl = "") {
  let first = false;
  const next = await updateUser(email, (u) => {
    if (!u) return undefined;
    const was = u.stayAlive;
    const wasOn = was && ["active", "trialing"].includes(was.status);
    const status = sub.status;
    const on = ["active", "trialing"].includes(status);
    u.stayAlive = {
      ...was,
      subId: sub.id,
      status,
      since: was?.since || sub.started_at || new Date().toISOString(),
      periodStart: sub.current_period_start || was?.periodStart || null,
      renews: sub.current_period_end || null,
      interval: sub.recurring_interval || was?.interval || "month",
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      endsAt: sub.ends_at || null,
      endedAt: sub.ended_at || null,
      customerId: sub.customer_id || was?.customerId || "",
      // Sites paid for: the plan's one plus extra seats ($5 a month each), as the subscription says.
      seats: Math.max(1, sub.seats || was?.seats || 1),
    };
    const firstSite = was?.sites?.[0] || was?.url || pageUrl || u.pendingUrl || "";
    u.stayAlive.sites = was?.sites?.length ? was.sites : firstSite ? [firstSite] : [];
    u.stayAlive.url = u.stayAlive.sites[0] || "";
    first = on && !wasOn;
    return u;
  });
  if (next?.stayAlive && ["active", "trialing"].includes(next.stayAlive.status)) {
    await addTo("idx:members", email);
    // The first check and re-stamp run after the answer, so the member sees monitoring on right away.
    if (first && next.stayAlive.url) waitUntil(runMonitor(email, { restamp: true, url: next.stayAlive.url }).catch((e) => console.error("Monitor failed:", e)));
  }
}

// One verified webhook event. Long work (the scout, the first re-stamp) runs inside; the caller keeps it alive.
export async function handleEvent(event) {
  const type = event?.type || "";
  const d = event?.data || {};
  if (type === "order.paid") {
    const plan = planOf(d.product_id || d.product?.id);
    if (plan !== "killSheet") return;
    const email = await ownerOf(d);
    if (email) await activateKillSheet(email, { orderId: d.id, checkoutId: d.checkout_id || "", pageUrl: pageFrom(d, await getUser(email)) });
  } else if (type === "order.refunded") {
    if (planOf(d.product_id || d.product?.id) !== "killSheet") return;
    const email = await ownerOf(d);
    if (email) await updateUser(email, (u) => (u?.killSheet?.orderId === d.id ? { ...u, killSheet: { ...u.killSheet, refunded: true } } : undefined));
  } else if (type.startsWith("subscription.")) {
    if (planOf(d.product_id || d.product?.id) !== "stayAlive") return;
    const email = await ownerOf(d);
    if (email) await syncStayAlive(email, d, pageFrom(d, await getUser(email)));
  }
}

// The buyer is back from Polar. With an API token we confirm the checkout right away instead of waiting for the webhook.
export async function confirmCheckout(email, checkoutId) {
  if (!polarApiReady() || !/^[0-9a-f-]{36}$/i.test(String(checkoutId || ""))) return false;
  const c = await polar(`/v1/checkouts/${checkoutId}`);
  if (c.status !== "succeeded") return false;
  const owner = await ownerOf(c);
  if (owner !== email) return false;
  const plan = planOf(c.product_id);
  const pageUrl = pageFrom(c, await getUser(email));
  if (plan === "killSheet") await activateKillSheet(email, { checkoutId: c.id, pageUrl });
  if (plan === "stayAlive" && c.subscription_id) await syncStayAlive(email, await polar(`/v1/subscriptions/${c.subscription_id}`), pageUrl);
  return true;
}

// Cancel at the end of the paid month. Without an API token, the dashboard sends them to Polar's customer portal.
export async function cancelStayAlive(email) {
  const u = await getUser(email);
  const id = u?.stayAlive?.subId;
  if (!id) throw new Error("No Stay Alive membership on this account.");
  const sub = await polar(`/v1/subscriptions/${id}`, { method: "PATCH", body: { cancel_at_period_end: true } });
  await syncStayAlive(email, sub);
  return sub;
}

export async function resumeStayAlive(email) {
  const u = await getUser(email);
  const id = u?.stayAlive?.subId;
  if (!id) throw new Error("No Stay Alive membership on this account.");
  const sub = await polar(`/v1/subscriptions/${id}`, { method: "PATCH", body: { cancel_at_period_end: false } });
  await syncStayAlive(email, sub);
  return sub;
}

// Change how many sites Stay Alive covers: the plan's one plus extra seats, prorated for the rest of the period.
// Lowering it below the sites on the account is refused; remove a site first.
export async function setStayAliveSeats(email, seats) {
  const u = await getUser(email);
  const id = u?.stayAlive?.subId;
  if (!id || !hasStayAlive(u)) throw Object.assign(new Error("Stay Alive isn't on for this account."), { status: 403 });
  const n = Math.max(1, Math.min(50, parseInt(seats, 10) || 1));
  const sites = (u.stayAlive.sites || []).length;
  if (n < sites) throw Object.assign(new Error(`You have ${sites} sites. Remove one first, then lower the count.`), { status: 409 });
  if (!polarApiReady()) throw Object.assign(new Error("Adding sites isn't switched on yet. Write to us and we'll add it for you."), { status: 503 });
  const sub = await polar(`/v1/subscriptions/${id}`, { method: "PATCH", body: { seats: n, proration_behavior: "prorate" } });
  await syncStayAlive(email, sub);
  return sub;
}
