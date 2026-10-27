// Accounts: one record per email, a session cookie, passwords (scrypt) or a one-time email link.
// The same email is passed to Polar checkout, so a payment lands on the right account. A payment for an
// email with no account yet creates one, so nothing paid is ever orphaned; signing up with that email claims it.
import crypto from "node:crypto";
import { get, set, remove, update, addTo } from "./_store.js";

export const COOKIE = "smp_s";
const SESSION_DAYS = 30;
const hash = (s) => crypto.createHash("sha256").update(String(s)).digest("base64url");

export const normEmail = (e) => String(e || "").trim().toLowerCase().slice(0, 200);
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 200;

export const userKey = (email) => `user:${normEmail(email)}`;
export const getUser = (email) => get(userKey(email));
export const saveUser = (u) => set(userKey(u.email), u);
export const updateUser = (email, fn) => update(userKey(email), fn);

export function newUser(email) {
  return { id: crypto.randomUUID(), email: normEmail(email), createdAt: new Date().toISOString(), pass: null, stamps: [], reviews: [] };
}

// The record for this email, created when it doesn't exist yet.
export async function ensureUser(email) {
  const e = normEmail(email);
  let u = await getUser(e);
  if (!u) {
    u = newUser(e);
    await saveUser(u);
    await Promise.all([set(`uid:${u.id}`, e), addTo("idx:users", e)]);
  }
  return u;
}

export const emailForId = (id) => (/^[0-9a-f-]{36}$/i.test(String(id || "")) ? get(`uid:${id}`) : null);

// Passwords

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await new Promise((ok, no) => crypto.scrypt(String(pw), salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? no(e) : ok(k))));
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}
export async function checkPassword(pw, stored) {
  const [kind, salt, want] = String(stored || "").split("$");
  if (kind !== "scrypt" || !salt || !want) return false;
  const key = await new Promise((ok, no) => crypto.scrypt(String(pw), Buffer.from(salt, "base64url"), 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? no(e) : ok(k))));
  const w = Buffer.from(want, "base64url");
  return w.length === key.length && crypto.timingSafeEqual(w, key);
}

// Wrong passwords per email: 8 in 15 minutes, then a pause.
export async function tooManyFails(email) {
  return Number((await get(`fail:${normEmail(email)}`)) || 0) >= 8;
}
export async function noteFail(email) {
  const k = `fail:${normEmail(email)}`;
  await set(k, Number((await get(k)) || 0) + 1, 15 * 60);
}
export const clearFails = (email) => remove(`fail:${normEmail(email)}`);

// Sessions: a random token in an HttpOnly cookie; only its hash is stored.

export async function startSession(res, email) {
  const token = crypto.randomBytes(32).toString("base64url");
  await set(`sess:${hash(token)}`, { email: normEmail(email), at: Date.now() }, SESSION_DAYS * 86400);
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
}

function readCookie(req) {
  const raw = String(req.headers.cookie || "");
  const m = raw.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  return m ? m.slice(COOKIE.length + 1) : "";
}

export async function sessionEmail(req) {
  const token = readCookie(req);
  if (!token || token.length > 100) return "";
  const s = await get(`sess:${hash(token)}`);
  return s?.email || "";
}

export async function endSession(req, res) {
  const token = readCookie(req);
  if (token) await remove(`sess:${hash(token)}`);
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

// One-time sign-in links, good for 15 minutes.
export async function magicToken(email, next = "") {
  const token = crypto.randomBytes(32).toString("base64url");
  await set(`magic:${hash(token)}`, { email: normEmail(email), next }, 15 * 60);
  return token;
}
export async function useMagicToken(token) {
  if (!token || token.length > 100) return null;
  const k = `magic:${hash(token)}`;
  const v = await get(k);
  if (v) await remove(k);
  return v;
}

// Memberships

export const hasKillSheet = (u) => !!(u?.killSheet && !u.killSheet.refunded);
export const hasStayAlive = (u) => !!(u?.stayAlive && ["active", "trialing"].includes(u.stayAlive.status));
export const isMember = (u) => hasKillSheet(u) || hasStayAlive(u);

// The start of the current month of a membership, counted from its billing day (a yearly plan still gets a
// fresh month every month). Without a billing day, the last 30 days.
function monthStart(anchor, now = new Date()) {
  if (!anchor) return new Date(now - 30 * 86400000);
  const a = new Date(anchor);
  const at = (n) => new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + n, a.getUTCDate(), a.getUTCHours(), a.getUTCMinutes()));
  let n = (now.getUTCFullYear() - a.getUTCFullYear()) * 12 + now.getUTCMonth() - a.getUTCMonth();
  while (n > 0 && at(n) > now) n--;
  return at(Math.max(0, n));
}

// App reviews included: the Kill Sheet includes one; Stay Alive includes one a month, billed monthly or yearly.
export function reviewAllowance(u) {
  const reviews = u?.reviews || [];
  const ks = hasKillSheet(u) ? Math.max(0, 1 - reviews.filter((r) => r.plan === "killSheet").length) : 0;
  let sa = 0;
  if (hasStayAlive(u)) {
    const from = monthStart(u.stayAlive.periodStart);
    sa = reviews.some((r) => r.plan === "stayAlive" && new Date(r.createdAt) >= from) ? 0 : 1;
  }
  return { killSheet: ks, stayAlive: sa, total: ks + sa };
}

// What the dashboard sees: never the password hash, never a test login.
export function publicUser(u) {
  if (!u) return null;
  const { pass, ...rest } = u;
  return { ...rest, hasPassword: !!pass, member: isMember(u), killSheetActive: hasKillSheet(u), stayAliveActive: hasStayAlive(u), reviewsLeft: reviewAllowance(u) };
}
