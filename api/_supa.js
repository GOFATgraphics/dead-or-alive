// Supabase Auth for email sign-up and email links. Supabase sends the emails (confirm sign-up, sign-in link);
// their templates point at https://<site>/auth/confirm?token_hash=…&type=…&next=…, which verifies the link here
// and starts our own session. Accounts, plans, and stamps stay in our store, keyed by the confirmed email.
// Everything runs server-side with the project's publishable key (api/_plans.js SUPABASE).
import { SUPABASE } from "./_plans.js";

export const supaReady = () => !!(SUPABASE.url && SUPABASE.key) && process.env.SUPABASE_EMAIL !== "off";

async function call(path, body, query = {}) {
  const u = new URL(`${SUPABASE.url}/auth/v1/${path}`);
  for (const [k, v] of Object.entries(query)) if (v) u.searchParams.set(k, v);
  const r = await fetch(u, { method: "POST", headers: { apikey: SUPABASE.key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data, code: data.error_code || data.code || "", msg: data.msg || data.error_description || data.message || "" };
}

// Signs in with a password. { ok, email } or { code } (invalid_credentials, email_not_confirmed, …).
export async function passwordSignIn(email, password) {
  const r = await call("token", { email, password }, { grant_type: "password" });
  if (r.ok && r.data.user?.email) return { ok: true, email: r.data.user.email };
  return { ok: false, code: r.code, msg: r.msg };
}

// Creates the login and sends the confirmation email. { sent } when it went out, { session, email } when
// confirmation is off, { exists } when the email already has a login (Supabase hides which, by design).
export async function signUp(email, password, redirectTo) {
  const r = await call("signup", { email, password }, { redirect_to: redirectTo });
  if (!r.ok) return { error: r.code || "failed", msg: r.msg };
  const user = r.data.user || r.data;
  if (r.data.access_token) return { session: true, email: user.email };
  if (Array.isArray(user?.identities) && user.identities.length === 0) return { exists: true };
  return { sent: true };
}

export const resendConfirmation = (email, redirectTo) => call("resend", { type: "signup", email }, { redirect_to: redirectTo });
export const sendSignInLink = (email, redirectTo) => call("otp", { email, create_user: true }, { redirect_to: redirectTo });

// The link from an email: the token hash and its type. { ok, email } when it's good.
export async function verifyLink(tokenHash, type) {
  const r = await call("verify", { token_hash: tokenHash, type });
  const email = r.data.user?.email;
  return r.ok && email ? { ok: true, email } : { ok: false, code: r.code };
}

// Messages for Supabase's error codes, in our words.
export const SAY = {
  weak_password: "Pick a stronger password: at least 8 characters, not a common one.",
  over_email_send_rate_limit: "We've sent a lot of emails just now. Wait a minute and try again.",
  over_request_rate_limit: "Too many tries. Wait a minute and try again.",
  email_address_invalid: "That email address can't receive mail. Check it and try again.",
  signup_disabled: "New sign-ups are paused. Try again later.",
};
