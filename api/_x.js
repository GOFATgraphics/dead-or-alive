// Sign in with X (OAuth 2.0 with PKCE). X shares the account's confirmed email (scope users.email), and the
// email is what the account and every payment are matched by, so X sign-in lands on the same account as email
// sign-in. Env: X_CLIENT_ID, X_CLIENT_SECRET. In the X developer portal: type "Web App", "Request email from
// users" on, callback URL https://<your domain>/auth/x/callback (or set X_REDIRECT_URI to the exact one you registered).
import crypto from "node:crypto";
import { get, remove, set } from "./_store.js";
import { ensureUser, startSession, updateUser, validEmail, normEmail } from "./_account.js";
import { siteOrigin } from "./_lib.js";

export const xReady = () => !!(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET);
const redirectUri = (req) => process.env.X_REDIRECT_URI || `${siteOrigin(req)}/auth/x/callback`;
const safeNext = (n) => (typeof n === "string" && /^\?[\w=&%.-]*$/.test(n) ? n : "");

// Step 1: off to X, with a one-time state and PKCE verifier kept for ten minutes.
export async function xStart(req, res) {
  if (!xReady()) return res.redirect(302, "/dashboard?x=off");
  const state = crypto.randomBytes(24).toString("base64url");
  const verifier = crypto.randomBytes(48).toString("base64url");
  await set(`xstate:${state}`, { verifier, next: safeNext(String(req.query.next || "")) }, 600);
  const u = new URL("https://x.com/i/oauth2/authorize");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", process.env.X_CLIENT_ID);
  u.searchParams.set("redirect_uri", redirectUri(req));
  u.searchParams.set("scope", "users.read tweet.read users.email");
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", crypto.createHash("sha256").update(verifier).digest("base64url"));
  u.searchParams.set("code_challenge_method", "S256");
  res.redirect(302, u.toString());
}

// Step 2: X sends the visitor back with a code. Trade it for a token, read the confirmed email, sign in.
export async function xCallback(req, res) {
  const fail = (why) => res.redirect(302, `/dashboard?x=${why}`);
  const state = String(req.query.state || "");
  if (req.query.error) return fail("cancelled");
  const saved = state.length < 100 ? await get(`xstate:${state}`) : null;
  if (!saved || !req.query.code) return fail("expired");
  await remove(`xstate:${state}`);
  try {
    const basic = Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString("base64");
    const t = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code: String(req.query.code), redirect_uri: redirectUri(req), code_verifier: saved.verifier }),
    });
    const tok = await t.json().catch(() => ({}));
    if (!t.ok || !tok.access_token) {
      console.error("X token exchange failed:", t.status, tok.error || "");
      return fail("failed");
    }
    const m = await fetch("https://api.x.com/2/users/me?user.fields=confirmed_email,username,profile_image_url", { headers: { Authorization: `Bearer ${tok.access_token}` } });
    const me = (await m.json().catch(() => ({})))?.data;
    if (!me?.id) return fail("failed");
    // An X account linked before signs in to the same account even if its email changed since.
    const linked = await get(`xid:${me.id}`);
    const email = linked || normEmail(me.confirmed_email);
    if (!validEmail(email)) return fail("noemail");
    await ensureUser(email);
    await updateUser(email, (u) => (u ? { ...u, x: { id: me.id, username: me.username || "", avatar: me.profile_image_url || "" } } : undefined));
    await set(`xid:${me.id}`, email);
    await startSession(res, email);
    return res.redirect(302, `/dashboard${saved.next}`);
  } catch (err) {
    console.error("X sign-in failed:", err);
    return fail("failed");
  }
}
