// Sign in with X. The account's confirmed email is what the account and every payment are matched by, so X
// sign-in lands on the same account as email sign-in. Two ways, the first that's set up wins:
// 1. Supabase Auth's X provider (api/_plans.js SUPABASE): the X app's callback is Supabase's, and
//    https://<your domain>/auth/x/callback must be in Supabase → Authentication → URL Configuration → Redirect URLs.
// 2. X directly: env X_CLIENT_ID and X_CLIENT_SECRET, X app callback https://<your domain>/auth/x/callback
//    (or X_REDIRECT_URI). Either way the X app needs "Request email from users" on.
import crypto from "node:crypto";
import { get, remove, set } from "./_store.js";
import { ensureUser, startSession, updateUser, validEmail, normEmail } from "./_account.js";
import { readResult, siteOrigin } from "./_lib.js";
import { SUPABASE } from "./_plans.js";

const direct = () => !!(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET);
const viaSupabase = () => !direct() && !!(SUPABASE.url && SUPABASE.key) && process.env.X_VIA_SUPABASE !== "off";
export const xReady = () => direct() || viaSupabase();
const COOKIE = "smp_x";
const redirectUri = (req) => process.env.X_REDIRECT_URI || `${siteOrigin(req)}/auth/x/callback`;
const safeNext = (n) => (typeof n === "string" && /^\?[\w=&%.-]*$/.test(n) ? n : "");

// Step 1: off to X, with a one-time state and PKCE verifier kept for ten minutes.
export async function xStart(req, res) {
  if (!xReady()) return res.redirect(302, "/dashboard?x=off");
  const state = crypto.randomBytes(24).toString("base64url");
  const verifier = crypto.randomBytes(48).toString("base64url");
  const claimId = String(req.query.claim || "");
  const claim = /^[A-Za-z0-9_-]{6,40}$/.test(claimId) ? claimId : "";
  await set(`xstate:${state}`, { verifier, next: safeNext(String(req.query.next || "")), claim }, 600);
  // A short cookie ties the return trip to this browser.
  res.setHeader("Set-Cookie", `${COOKIE}=${state}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  if (viaSupabase()) {
    const s = new URL(`${SUPABASE.url}/auth/v1/authorize`);
    s.searchParams.set("provider", "x");
    s.searchParams.set("redirect_to", redirectUri(req));
    s.searchParams.set("code_challenge", crypto.createHash("sha256").update(verifier).digest("base64url"));
    s.searchParams.set("code_challenge_method", "s256");
    return res.redirect(302, s.toString());
  }
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
  // Our state comes back in the query (X directly) or only in the cookie (Supabase keeps its own state).
  const cookieState = (String(req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`)) || "").slice(COOKIE.length + 1);
  const state = viaSupabase() ? cookieState : String(req.query.state || "");
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  if (req.query.error) return fail(/email/i.test(String(req.query.error_description || "")) ? "noemail" : "cancelled");
  if (!viaSupabase() && state !== cookieState) return fail("expired");
  const saved = state.length < 100 ? await get(`xstate:${state}`) : null;
  if (!saved || !req.query.code) return fail("expired");
  await remove(`xstate:${state}`);
  try {
    if (viaSupabase()) {
      const t = await fetch(`${SUPABASE.url}/auth/v1/token?grant_type=pkce`, {
        method: "POST",
        headers: { apikey: SUPABASE.key, "Content-Type": "application/json" },
        body: JSON.stringify({ auth_code: String(req.query.code), code_verifier: saved.verifier }),
      });
      const tok = await t.json().catch(() => ({}));
      if (!t.ok || !tok.user) {
        console.error("X sign-in code exchange failed:", t.status, tok.error_code || tok.msg || "");
        return fail("failed");
      }
      const xid = tok.user.identities?.find((i) => i.provider === "x")?.id || tok.user.user_metadata?.provider_id || tok.user.id;
      const meta = tok.user.user_metadata || {};
      return finish(res, { id: String(xid), username: meta.user_name || meta.preferred_username || "", avatar: meta.avatar_url || "", name: meta.name || meta.full_name || "", verified: meta.verified === true, email: tok.user.email }, saved.next, fail, saved.claim || "");
    }
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
    const m = await fetch("https://api.x.com/2/users/me?user.fields=confirmed_email,username,profile_image_url,verified,verified_type,name,description,public_metrics", { headers: { Authorization: `Bearer ${tok.access_token}` } });
    const me = (await m.json().catch(() => ({})))?.data;
    if (!me?.id) return fail("failed");
    return finish(res, { id: me.id, username: me.username || "", avatar: me.profile_image_url || "", name: me.name || "", verified: me.verified === true, verifiedType: me.verified_type || "", bio: String(me.description || "").slice(0, 280), followers: Number.isFinite(me.public_metrics?.followers_count) ? me.public_metrics.followers_count : null, email: me.confirmed_email }, saved.next, fail, saved.claim || "");
  } catch (err) {
    console.error("X sign-in failed:", err);
    return fail("failed");
  }
}

// X's small profile picture, at a size fit for a card. The stored URL is usually the 48px _normal variant.
const biggerAvatar = (u) => String(u || "").replace("_normal.", "_400x400.");

// Signs in the account for this X identity. An X account linked before signs in to the same account even if
// its email changed since; a new one needs a confirmed email. Name and verified are stored when X gives
// them, so a stamp can show its owner: a badge is shown only when verified is confirmed true, never from
// a missing field.
async function finish(res, x, next, fail, claimId = "") {
  const linked = await get(`xid:${x.id}`);
  const email = linked || normEmail(x.email);
  if (!validEmail(email)) return fail("noemail");
  await ensureUser(email);
  await updateUser(email, (u) => (u ? { ...u, x: { id: x.id, username: x.username, avatar: biggerAvatar(x.avatar), name: x.name || "", verified: x.verified === true, verifiedType: x.verifiedType || "", bio: x.bio || "", followers: x.followers ?? null, at: new Date().toISOString() } } : undefined));
  await set(`xid:${x.id}`, email);
  // A claim from the result page: connecting X here is the claim itself, even if X was already
  // used for sign-up. First claimer wins; a later claimer keeps the existing card, never takes it.
  if (claimId) {
    const existing = await get(`claim:${claimId}`).catch(() => null);
    if (!existing) {
      await set(`claim:${claimId}`, email).catch(() => {});
      const rr = await readResult(claimId).catch(() => null);
      if (rr) {
        const h = String(rr.host || "").toLowerCase().trim();
        if (h) {
          const hostClaim = await get(`claimhost:${h}`).catch(() => null);
          if (!hostClaim) await set(`claimhost:${h}`, email).catch(() => {});
        }
        await updateUser(email, (u) => {
          if (!u) return undefined;
          if ((u.stamps || []).some((s) => s.id === claimId)) return undefined;
          const add = { id: rr.id, url: rr.pageUrl, host: rr.host, verdict: rr.verdict, score: rr.score ?? null, icon: rr.icon || "", at: rr.createdAt };
          u.stamps = [...(u.stamps || []), add].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 200);
          return u;
        }).catch(() => {});
      }
    }
  }
  await startSession(res, email);
  return res.redirect(302, claimId ? `/v/${claimId}` : `/dashboard${next}`);
}
