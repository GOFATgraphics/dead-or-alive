// Public. Everything the dashboard does, by ?op= (GET) or { op } (POST). One route, so the site stays within
// Vercel's 12-function limit. Signed-in state is an HttpOnly session cookie (see _account.js).
//   GET  me                      the account, its stamps, Kill Sheet report, Stay Alive monitor
//   GET  link&t=...              a one-time email sign-in link: signs in, then opens the dashboard
//   POST signup | login | sendlink | sendcode | verify-code | logout | password | delete
//   POST claim { jobs }          saves free stamps this browser made to the account
//   POST verify-token { host }   the DNS TXT record for Stage 3 website verification
//   POST verify-domain { host }  checks that TXT record and marks the site verified
//   POST checkout { plan, url }  the Polar checkout link, with this account's email and id
//   POST confirm { checkoutId }  back from Polar: confirm the payment now if the API token is set
//   POST url { plan, url }       sets the page a plan works on and starts its run
//   POST restamp                 uses the Kill Sheet's free re-stamp: re-runs the scout
//   POST cancel | resume         Stay Alive at the end of the paid month
//   POST review { ... }          submits an app review; POST revoke { id } deletes its test login
import crypto from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { isResultId, readResult, resultId } from "./_lib.js";
import { mail } from "./_publish.js";
import { addTo, get, remove, seal, set, storeReady, unseal } from "./_store.js";
import {
  checkPassword, clearFails, endSession, ensureUser, getUser, hasKillSheet, hasStayAlive, hashPassword, magicToken, noteFail, normEmail,
  publicUser, reviewAllowance, sessionEmail, startSession, tooManyFails, updateUser, useMagicToken, userKey, validEmail,
} from "./_account.js";
import { cancelStayAlive, checkoutUrl, confirmCheckout, polarApiReady, reconcile, resumeStayAlive, setStayAliveSeats } from "./_billing.js";
import { readReport, runScout } from "./_scout.js";
import { forgetSite, readMonitors, runMonitor, seatsOf, setPublicStatus, sendReportNow, sitesOf } from "./_monitor.js";
import { xCallback, xReady, xStart } from "./_x.js";
import { SAY, passwordSignIn, resendConfirmation, sendSignInCode, sendSignInLink, signUp, supaReady, updateOwnPassword, verifyCode, verifyLink } from "./_supa.js";
import { PLANS } from "../src/config.js";
import { PORTAL } from "./_plans.js";
import { checkPageUrl, pageKind } from "../src/url.js";
import { checkDomain, ensureToken } from "./_gate.js";

const mailReady = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
const origin = () => (process.env.SITE_URL || "https://stampmypage.com").replace(/\/$/, "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function body(req) {
  let b = req.body;
  if (typeof b === "string") {
    try {
      b = JSON.parse(b);
    } catch (_) {
      b = {};
    }
  }
  return b && typeof b === "object" ? b : {};
}

// A POST must come from this site's own pages.
function sameSite(req) {
  const o = String(req.headers.origin || "");
  if (!o) return true;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  try {
    return new URL(o).host === host;
  } catch (_) {
    return false;
  }
}

// A plan that isn't on yet: ask the payment provider directly, at most every two minutes per account, so a
// payment whose message never arrived still lands. Never blocks the dashboard on an error.
async function heal(email) {
  try {
    const u = await getUser(email);
    if (!u || (hasKillSheet(u) && hasStayAlive(u)) || !polarApiReady()) return;
    if (await get(`heal:${email}`)) return;
    await set(`heal:${email}`, 1, 120);
    await reconcile(email);
  } catch (err) {
    console.error("Heal failed:", err);
  }
}

async function me(email) {
  const u = await getUser(email);
  if (!u) return { user: null };
  const [report, monitors] = await Promise.all([hasKillSheet(u) ? readReport(email) : null, u.stayAlive ? readMonitors(email, u) : null]);
  // monitor: the first site, for the overview; monitors: every site on the account.
  const monitor = monitors?.[0]?.checks ? monitors[0] : null;
  return { user: publicUser(u), report, monitor, monitors };
}

function setup() {
  return { ready: storeReady(), emailLinks: supaReady() || mailReady(), code: supaReady(), x: xReady(), polarApi: polarApiReady(), portal: PORTAL };
}

async function sendLink(email, next) {
  const t = await magicToken(email, next);
  const link = `${origin()}/api/account?op=link&t=${encodeURIComponent(t)}`;
  return mail(email, {
    subject: "Your Stamp My Page sign-in link",
    text: `Sign in to Stamp My Page:\n\n${link}\n\nThe link works once, for 15 minutes. If you didn't ask for it, ignore this email.`,
    html: `<p>Sign in to Stamp My Page:</p><p><a href="${link}" style="display:inline-block;background:#15142a;color:#fff;text-decoration:none;font-weight:600;border-radius:12px;padding:12px 20px">Sign in</a></p><p style="color:#5d6180;font-size:13px">The link works once, for 15 minutes. If you didn't ask for it, ignore this email.</p>`,
  });
}

// Where a confirmed visitor goes next: the dashboard URL they started from (it comes back as next, with its own
// query split into the other params), or the dashboard. Only this site's dashboard, never somewhere else.
function afterConfirm(q) {
  let path = "/dashboard";
  const keep = new URLSearchParams();
  try {
    const n = new URL(String(q.next || ""), "https://x.invalid");
    if (n.pathname.replace(/\/$/, "") === "/dashboard") n.searchParams.forEach((v, k) => keep.set(k, v));
  } catch (_) {}
  for (const [k, v] of Object.entries(q)) if (!["token_hash", "type", "next", "op"].includes(k) && typeof v === "string") keep.set(k, v);
  keep.set("confirmed", "1");
  const qs = [...keep.entries()].filter(([k, v]) => /^[\w-]{1,20}$/.test(k) && String(v).length < 600);
  return `${path}?${new URLSearchParams(qs).toString()}`;
}

// The dashboard address a sign-up started from, for the confirmation email to bring them back to.
const backTo = (next) => `${origin()}/dashboard${typeof next === "string" && /^\?[\w=&%.-]*$/.test(next) ? next : ""}`;

// Free stamps the browser made: the job id is only known to the browser that started it, so it proves the stamp is theirs.
async function claim(email, jobs, directIds = []) {
  // Two ways in: job ids from the browser that made the stamp (proof it is theirs), and stamp ids
  // from a result page Claim button or a ?save= link (so a visitor who opens the result in another
  // browser can still claim it). Either way, first saver wins, and an already-owned stamp is skipped,
  // so claiming by link cannot take someone else's stamp.
  const fromJobs = [...new Set((Array.isArray(jobs) ? jobs : []).filter((j) => UUID.test(String(j))).slice(0, 50))].map((j) => resultId(j));
  const direct = [...new Set((Array.isArray(directIds) ? directIds : []).filter((id) => isResultId(id)).slice(0, 50))];
  const ids = [...new Set([...fromJobs, ...direct])];
  const found = (await Promise.all(ids.map((id) => readResult(id)))).filter(Boolean);
  if (!found.length) return 0;
  // A stamp belongs to the first account that saves it. Another account signing in on the same browser later
  // doesn't get it too.
  const mine = [];
  for (const r of found) {
    const owner = await get(`owner:${r.id}`);
    if (owner && owner !== email) continue;
    if (!owner) await set(`owner:${r.id}`, email);
    mine.push(r);
  }
  let added = 0;
  await updateUser(email, (u) => {
    if (!u) return undefined;
    const have = new Set((u.stamps || []).map((s) => s.id));
    const add = mine.filter((r) => !have.has(r.id)).map((r) => ({ id: r.id, url: r.pageUrl, host: r.host, verdict: r.verdict, score: r.score ?? null, icon: r.icon || "", at: r.createdAt }));
    added = add.length;
    if (!add.length) return undefined;
    u.stamps = [...(u.stamps || []), ...add].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 200);
    return u;
  });
  return added;
}

// Manual site claim, separate from saving a stamp. Saving never creates a claim card on its own;
// only an explicit Claim this site press sets claim:<id>. First claimer wins, and a later claimer
// gets taken:true, never the card over. The stamp is also added to the claimer's dashboard list.
async function claimSite(email, id) {
  if (!isResultId(id)) return { error: "No such stamp." };
  const r = await readResult(id);
  if (!r) return { error: "No such stamp." };
  const existing = await get(`claim:${id}`).catch(() => null);
  if (existing && existing !== email) return { taken: true };
  const u = await getUser(email);
  const hasX = !!u?.x?.username;
  if (!existing) {
    await set(`claim:${id}`, email);
    const h = String(r.host || "").toLowerCase().trim();
    if (h) {
      const hostClaim = await get(`claimhost:${h}`).catch(() => null);
      if (!hostClaim) await set(`claimhost:${h}`, email).catch(() => {});
    }
    await updateUser(email, (cur) => {
      if (!cur) return undefined;
      if ((cur.stamps || []).some((s) => s.id === id)) return undefined;
      const add = { id: r.id, url: r.pageUrl, host: r.host, verdict: r.verdict, score: r.score ?? null, icon: r.icon || "", at: r.createdAt };
      cur.stamps = [...(cur.stamps || []), add].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 200);
      return cur;
    });
  }
  return { claimed: true, hasX, username: u?.x?.username || "" };
}

const APP_LINK = /^https:\/\/(apps\.apple\.com|itunes\.apple\.com|play\.google\.com|testflight\.apple\.com)\//i;

async function submitReview(email, b) {
  const u = await getUser(email);
  const left = reviewAllowance(u);
  if (!left.total) throw Object.assign(new Error(hasKillSheet(u) || hasStayAlive(u) ? "Your included app review is already in. Stay Alive includes one a month, for the site you choose." : "App reviews come with the Kill Sheet or Stay Alive."), { status: 403 });
  const site = String(b.siteUrl || "").trim() ? checkPageUrl(b.siteUrl) : { url: "" };
  if (site.error) throw Object.assign(new Error(`Site URL: ${site.error}`), { status: 400 });
  const app = String(b.appUrl || "").trim();
  if (app && !APP_LINK.test(app)) throw Object.assign(new Error("Use an App Store, TestFlight, or Google Play link for the app."), { status: 400 });
  if (!site.url && !app) throw Object.assign(new Error("Add your site URL, your app's store link, or both."), { status: 400 });
  const what = String(b.what || "").trim().slice(0, 3000);
  if (what.length < 10) throw Object.assign(new Error("Say what to test, back to back: the steps a new user takes."), { status: 400 });
  const loginEmail = String(b.loginEmail || "").trim().slice(0, 200);
  const loginPassword = String(b.loginPassword || "").slice(0, 200);
  const hasLogin = !!(loginEmail || loginPassword);
  if (hasLogin && !(loginEmail && loginPassword)) throw Object.assign(new Error("Add both the test account's email and password, or leave both empty."), { status: 400 });
  if (hasLogin && b.throwaway !== true) throw Object.assign(new Error("Confirm it's a throwaway test account with no real data and no saved card."), { status: 400 });

  const id = crypto.randomBytes(8).toString("base64url");
  if (hasLogin) await set(`cred:${id}`, { sealed: seal(JSON.stringify({ email: loginEmail, password: loginPassword })) }, 60 * 86400);
  const plan = left.killSheet ? "killSheet" : "stayAlive";
  // One Stay Alive review a month in total, not one per site: the member picks which of their sites gets it.
  const sites = sitesOf(u);
  if (plan === "stayAlive" && site.url && sites.length > 1 && !sites.includes(site.url)) throw Object.assign(new Error("Pick one of your Stay Alive sites for this month's review."), { status: 400 });
  const now = new Date().toISOString();
  const review = { id, plan, status: "received", createdAt: now, updatedAt: now, siteUrl: site.url || "", appUrl: app, what, login: hasLogin ? "stored" : "none", result: null };
  await updateUser(email, (x) => (x ? { ...x, reviews: [review, ...(x.reviews || [])].slice(0, 50) } : undefined));
  await addTo("idx:reviews", `${normEmail(email)}|${id}`);
  // Tell the desk a review came in, when email is set up.
  if (process.env.CONTACT_EMAIL) mail(process.env.CONTACT_EMAIL, { subject: `App review received: ${site.url || app}`, text: `${email} sent an app review (${plan}). Open /admin → Reviews.` }).catch(() => {});
  return review;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  if (!storeReady()) return res.status(503).json({ error: "Accounts are being set up. Try again shortly.", setup: setup() });

  const q = req.query || {};
  if (req.method === "GET") {
    if (q.op === "x") return xStart(req, res);
    if (q.op === "x-callback") return xCallback(req, res);
    // A link from a sign-up confirmation or sign-in email. Supabase's template sends it here with the token hash.
    if (q.op === "confirm") {
      const v = await verifyLink(String(q.token_hash || ""), String(q.type || "email")).catch(() => ({ ok: false }));
      if (!v.ok) return res.redirect(302, "/dashboard?link=expired");
      const email = normEmail(v.email);
      await ensureUser(email);
      await startSession(res, email);
      return res.redirect(302, afterConfirm(q));
    }
    if (q.op === "link") {
      const v = await useMagicToken(String(q.t || ""));
      if (!v) return res.redirect(302, "/dashboard?link=expired");
      await ensureUser(v.email);
      await startSession(res, v.email);
      return res.redirect(302, `/dashboard${v.next && /^\?[\w=&%.-]*$/.test(v.next) ? v.next : ""}`);
    }
    const email = await sessionEmail(req);
    if (email) await heal(email);
    return res.status(200).json({ ...(email ? await me(email) : { user: null }), setup: setup() });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "GET or POST." });
  if (!sameSite(req)) return res.status(403).json({ error: "Not from this site." });
  const b = body(req);
  const op = String(b.op || q.op || "");

  try {
    // Signed-out operations.
    // One form: a new email gets an account, a known one signs in.
    if (op === "continue") {
      const email = normEmail(b.email);
      const password = String(b.password || "");
      if (!validEmail(email)) return res.status(400).json({ error: "Enter a real email address." });
      if (await tooManyFails(email)) return res.status(429).json({ error: "Too many tries. Wait 15 minutes, then try again." });
      const u = await getUser(email);
      let created = false;
      if (u?.pass) {
        // Accounts made before email confirmation keep their own password. A correct password earns a
        // code, not a session yet: email, password, Continue, then the code. Without Supabase, the old
        // direct sign-in below still applies.
        if (!(await checkPassword(password, u.pass))) {
          await noteFail(email);
          await new Promise((r) => setTimeout(r, 400));
          return res.status(401).json({ error: "That password doesn't match this email.", code: "wrongpass" });
        }
        await clearFails(email);
        if (supaReady()) {
          const c = await sendSignInCode(email);
          if (!c.ok) return res.status(c.status === 429 ? 429 : 502).json({ error: SAY[c.code] || "The code didn't send. Try again." });
          return res.status(202).json({ sent: true, code: true, note: `We sent a code to ${email}. Enter it below to continue.` });
        }
      } else if (supaReady()) {
        // Sign in; if there's no login for this email yet, sign up, and the confirmation code goes out.
        // A correct password never signs in directly here: it earns a code, and the code signs in.
        const r = await passwordSignIn(email, password);
        if (r.ok) {
          const c = await sendSignInCode(email);
          if (!c.ok) return res.status(c.status === 429 ? 429 : 502).json({ error: SAY[c.code] || "The code didn't send. Try again." });
          await clearFails(email);
          return res.status(202).json({ sent: true, code: true, note: `We sent a code to ${email}. Enter it below to continue.` });
        }
        if (!r.ok && r.code === "email_not_confirmed") {
          await resendConfirmation(email, backTo(b.next)).catch(() => {});
          return res.status(202).json({ sent: true, code: true, note: `Confirm your email first. We sent a code to ${email}. Enter it below to continue.` });
        }
        if (!r.ok) {
          if (password.length < 8) return res.status(400).json({ error: "New here? Pick a password with at least 8 characters. Been here before? That password doesn't match." });
          const up = await signUp(email, password, backTo(b.next));
          if (up.exists) {
            await noteFail(email);
            return res.status(401).json({ error: `That password doesn't match this email.${u?.x ? " This account also signs in with X." : ""}`, code: "wrongpass" });
          }
          // Supabase can't send yet (no email service connected there): don't lose the sign-up, keep the password here.
          if (up.error && !SAY[up.error] && !u) {
            console.error("Confirmation email failed, account made without it:", up.error, up.msg);
            await ensureUser(email);
            await updateUser(email, async (x) => ({ ...x, pass: await hashPassword(password) }));
            await startSession(res, email);
            if (Array.isArray(b.jobs)) await claim(email, b.jobs);
            return res.status(200).json({ ...(await me(email)), created: true, setup: setup() });
          }
          if (up.error) return res.status(400).json({ error: SAY[up.error] || up.msg || "That didn't work. Try again." });
          if (up.sent) return res.status(202).json({ sent: true, confirm: true, code: true, note: `Almost there. We sent a code to ${email}. Enter it below to finish.` });
          created = !u;
        }
        await clearFails(email);
        await ensureUser(email);
      } else {
        // No email service: the old way, a password kept here.
        if (u) return res.status(409).json({ error: `That email already has an account${u.x ? " linked to X. Use Continue with X" : `. Write to ${process.env.CONTACT_EMAIL || "us"} and we'll help you in`}.` });
        if (password.length < 8) return res.status(400).json({ error: "New here? Pick a password with at least 8 characters." });
        await ensureUser(email);
        await updateUser(email, async (x) => ({ ...x, pass: await hashPassword(password) }));
        created = true;
      }
      await startSession(res, email);
      if (Array.isArray(b.jobs)) await claim(email, b.jobs);
      return res.status(200).json({ ...(await me(email)), created, setup: setup() });
    }
    if (op === "signup" || op === "login") {
      const email = normEmail(b.email);
      const password = String(b.password || "");
      if (!validEmail(email)) return res.status(400).json({ error: "Enter a real email address." });
      if (await tooManyFails(email)) return res.status(429).json({ error: "Too many tries. Wait 15 minutes, or use an email link." });
      const u = await getUser(email);
      if (op === "signup") {
        if (password.length < 8) return res.status(400).json({ error: "Use at least 8 characters for the password." });
        if (u?.pass) return res.status(409).json({ error: "That email already has an account. Sign in instead.", code: "exists" });
        if (u && !u.pass) {
          // The account exists (a payment made it, or an email link). Prove the email before a password goes on it.
          if (!mailReady()) return res.status(409).json({ error: `That email already has an account. Write to ${process.env.CONTACT_EMAIL || "us"} and we'll help you in.` });
          await sendLink(email, String(b.next || ""));
          return res.status(202).json({ sent: true, note: "That email already has an account. We sent a sign-in link to prove it's yours; set a password once you're in." });
        }
        const fresh = await ensureUser(email);
        await updateUser(email, async (x) => ({ ...x, pass: await hashPassword(password) }));
        await startSession(res, fresh.email);
      } else {
        if (!u?.pass || !(await checkPassword(password, u.pass))) {
          await noteFail(email);
          await new Promise((r) => setTimeout(r, 400));
          return res.status(401).json({ error: u && !u.pass ? "This account signs in with an email link. Use “Email me a link”." : "Wrong email or password." });
        }
        await clearFails(email);
        await startSession(res, email);
      }
      if (Array.isArray(b.jobs)) await claim(email, b.jobs);
      return res.status(200).json({ ...(await me(email)), setup: setup() });
    }
    if (op === "sendcode") {
      const email = normEmail(b.email);
      if (!validEmail(email)) return res.status(400).json({ error: "Enter a real email address." });
      if (!supaReady()) return res.status(503).json({ error: "Codes need Supabase. Try again later." });
      const r = await sendSignInCode(email);
      if (!r.ok) return res.status(r.status === 429 ? 429 : 502).json({ error: SAY[r.code] || "The email didn't send. Try again." });
      return res.status(202).json({ sent: true, code: true, note: `We sent a code to ${email}. Enter it below to continue.` });
    }
    if (op === "verify-code") {
      const email = normEmail(b.email);
      const token = String(b.token || "").replace(/[\s-]/g, "");
      if (!validEmail(email)) return res.status(400).json({ error: "Enter a real email address." });
      if (!/^\d{6,8}$/.test(token)) return res.status(400).json({ error: "Enter the code from the email." });
      if (!supaReady()) return res.status(503).json({ error: "Codes need Supabase. Try again later." });
      if (await tooManyFails(email)) return res.status(429).json({ error: "Too many tries. Wait 15 minutes, then try again." });
      // A sign-up code first, then a sign-in code: both prove the same inbox.
      const v = (await verifyCode(email, token, "signup").catch(() => ({ ok: false }))) || { ok: false };
      const w = v.ok ? v : await verifyCode(email, token, "email").catch(() => ({ ok: false }));
      if (!w.ok) {
        await noteFail(email);
        return res.status(400).json({ error: "That code didn't match or it expired. Try again, or send a new code.", code: "badcode" });
      }
      await clearFails(email);
      await ensureUser(w.email);
      await startSession(res, w.email);
      if (Array.isArray(b.jobs)) await claim(w.email, b.jobs);
      return res.status(200).json({ ...(await me(w.email)), verified: true, setup: setup() });
    }
    if (op === "forgot") {
      const email = normEmail(b.email);
      if (!validEmail(email)) return res.status(400).json({ error: "Enter a real email address." });
      if (!supaReady()) return res.status(503).json({ error: `Forgot your password and can't get a code? Write to ${process.env.CONTACT_EMAIL || "us"} and we'll help you in.` });
      const r = await sendSignInCode(email);
      if (!r.ok) return res.status(r.status === 429 ? 429 : 502).json({ error: SAY[r.code] || "The email didn't send. Try again." });
      return res.status(202).json({ sent: true, code: true, note: `We sent a code to ${email}. Enter it below with a new password.` });
    }
    if (op === "verify-reset-code") {
      // Step 2 of a reset: the code alone. A good code earns a one-time reset token, good for 15
      // minutes, that carries the verified session (sealed) into step 3. The code itself is spent here,
      // so it can't be replayed, and step 3 never needs the code again.
      const email = normEmail(b.email);
      const token = String(b.token || "").replace(/[\s-]/g, "");
      if (!validEmail(email)) return res.status(400).json({ error: "Enter a real email address." });
      if (!/^\d{6,8}$/.test(token)) return res.status(400).json({ error: "Enter the code from the email." });
      if (!supaReady()) return res.status(503).json({ error: "Codes need Supabase. Try again later." });
      if (await tooManyFails(email)) return res.status(429).json({ error: "Too many tries. Wait 15 minutes, then try again." });
      const v = (await verifyCode(email, token, "signup").catch(() => ({ ok: false }))) || { ok: false };
      const w = v.ok ? v : await verifyCode(email, token, "email").catch(() => ({ ok: false }));
      if (!w.ok || !w.accessToken) {
        await noteFail(email);
        return res.status(400).json({ error: "That code didn't match or it expired. Try again, or send a new code.", code: "badcode" });
      }
      await clearFails(w.email);
      const resetToken = crypto.randomBytes(32).toString("base64url");
      const key = `reset:${crypto.createHash("sha256").update(resetToken).digest("base64url")}`;
      await set(key, { email: w.email, sealed: seal(w.accessToken) }, 15 * 60);
      return res.status(200).json({ verified: true, resetToken, note: "Code confirmed. Create your new password." });
    }
    if (op === "reset-password") {
      // Step 3 of a reset: new password plus confirmation, authorised by the reset token from step 2.
      // The email comes from the token, not from the request, so one reset can't be aimed at another
      // account. No session starts here: the user signs in the normal way, with the new password and a
      // fresh code.
      const resetToken = String(b.resetToken || "");
      const password = String(b.password || "");
      const confirm = String(b.confirm || "");
      if (!resetToken || resetToken.length > 100) return res.status(400).json({ error: "That reset session expired. Send a new code and try again." });
      if (password.length < 8) return res.status(400).json({ error: "Pick a new password with at least 8 characters." });
      if (password !== confirm) return res.status(400).json({ error: "The two passwords don't match. Type them again." });
      if (!supaReady()) return res.status(503).json({ error: "Codes need Supabase. Try again later." });
      const key = `reset:${crypto.createHash("sha256").update(resetToken).digest("base64url")}`;
      const rec = await get(key);
      if (rec) await remove(key);
      if (!rec?.email || !rec?.sealed) return res.status(400).json({ error: "That reset session expired. Send a new code and try again." });
      let accessToken = "";
      try { accessToken = unseal(rec.sealed); } catch { accessToken = ""; }
      if (!accessToken) return res.status(400).json({ error: "That reset session expired. Send a new code and try again." });
      const upd = await updateOwnPassword(accessToken, password);
      if (!upd.ok) return res.status(502).json({ error: SAY[upd.code] || "That didn't work. Send a new code and try again." });
      const u = await getUser(rec.email);
      if (u?.pass) await updateUser(rec.email, async (x) => ({ ...x, pass: await hashPassword(password) }));
      await clearFails(rec.email);
      return res.status(200).json({ reset: true, note: "Password changed. Sign in with your new password." });
    }
    if (op === "sendlink") {
      const email = normEmail(b.email);
      if (!validEmail(email)) return res.status(400).json({ error: "Enter a real email address." });
      if (supaReady()) {
        const r = await sendSignInLink(email, backTo(b.next));
        if (r.ok) return res.status(202).json({ sent: true });
        if (!mailReady()) return res.status(r.status === 429 ? 429 : 502).json({ error: SAY[r.code] || "The email didn't send. Try again, or use a password." });
      }
      if (!mailReady()) return res.status(503).json({ error: "Email links aren't switched on yet. Use a password." });
      const out = await sendLink(email, String(b.next || ""));
      if (!out.emailed) return res.status(502).json({ error: "The email didn't send. Try again, or use a password." });
      return res.status(202).json({ sent: true });
    }

    const email = await sessionEmail(req);
    if (op === "logout") {
      await endSession(req, res);
      return res.status(200).json({ user: null });
    }
    if (!email) return res.status(401).json({ error: "Sign in first.", code: "signin" });

    if (op === "password") {
      const pw = String(b.password || "");
      if (pw.length < 8) return res.status(400).json({ error: "Use at least 8 characters." });
      await updateUser(email, async (u) => (u ? { ...u, pass: await hashPassword(pw) } : undefined));
      return res.status(200).json({ ok: true });
    }
    if (op === "claim") {
      const n = await claim(email, b.jobs, b.ids);
      return res.status(200).json({ saved: n, ...(await me(email)) });
    }
    if (op === "claim-site") {
      const out = await claimSite(email, String(b.id || ""));
      if (out.error) return res.status(404).json(out);
      return res.status(200).json({ ...out, ...(await me(email)) });
    }
    // Stage 3, website verification: the DNS TXT record for this account and host, and the check that
    // marks the site verified. Reading the technical report (Stage 2) does not need this.
    if (op === "verify-token") {
      return res.status(200).json(await ensureToken(email, b.host));
    }
    if (op === "verify-domain") {
      const v = await checkDomain(email, b.host);
      if (v.error && !v.pending) return res.status(400).json(v);
      return res.status(200).json(v);
    }
    if (op === "checkout") {
      const plan = String(b.plan || "");
      if (!PLANS[plan]) return res.status(400).json({ error: "Pick the Kill Sheet or Stay Alive." });
      const page = String(b.url || "").trim() ? checkPageUrl(b.url) : { url: "" };
      const u = await updateUser(email, (x) => (x ? { ...x, pendingUrl: page.url || x.pendingUrl || "" } : undefined));
      if (plan === "stayAlive" && hasStayAlive(u)) return res.status(409).json({ error: "Stay Alive is already on for this account." });
      return res.status(200).json({ url: checkoutUrl(plan, u, page.url || u.pendingUrl || "", plan === "stayAlive" && b.billing === "yearly") });
    }
    if (op === "confirm") {
      const ok = await confirmCheckout(email, String(b.checkoutId || "")).catch(() => false);
      return res.status(200).json({ confirmed: ok, ...(await me(email)) });
    }
    if (op === "url") {
      const plan = String(b.plan || "");
      const page = checkPageUrl(b.url);
      if (!page.url) return res.status(400).json({ error: page.error });
      if (pageKind(page.url) !== "web") return res.status(400).json({ error: "Use your public landing page, not a store listing, file, or login page." });
      const u = await getUser(email);
      if (plan === "killSheet") {
        if (!hasKillSheet(u)) return res.status(403).json({ error: "The Kill Sheet isn't on this account." });
        const report = await readReport(email);
        if (report && report.status !== "failed" && u.killSheet.url) return res.status(409).json({ error: "The Kill Sheet already ran. Use your free re-stamp to run it again." });
        await updateUser(email, (x) => ({ ...x, killSheet: { ...x.killSheet, url: page.url } }));
        waitUntil(runScout(email, page.url).catch((e) => console.error("Scout failed:", e)));
      } else if (plan === "stayAlive") {
        if (!hasStayAlive(u)) return res.status(403).json({ error: "Stay Alive isn't on for this account." });
        // The plan's first site (set or replaced). More sites go through op "site".
        await updateUser(email, (x) => {
          const sites = sitesOf(x).filter((s) => s !== page.url);
          return { ...x, stayAlive: { ...x.stayAlive, url: page.url, sites: [page.url, ...sites.slice(1)] } };
        });
        waitUntil(runMonitor(email, { restamp: true, url: page.url }).catch((e) => console.error("Monitor failed:", e)));
      } else return res.status(400).json({ error: "Unknown plan." });
      return res.status(202).json(await me(email));
    }
    // Stay Alive sites: add one into a paid slot, or remove one. The first site comes with the plan.
    if (op === "site") {
      const u = await getUser(email);
      if (!hasStayAlive(u)) return res.status(403).json({ error: "Stay Alive isn't on for this account." });
      const page = checkPageUrl(b.url);
      if (!page.url) return res.status(400).json({ error: page.error });
      const sites = sitesOf(u);
      if (b.action === "remove") {
        if (!sites.includes(page.url)) return res.status(404).json({ error: "That site isn't on your account." });
        await updateUser(email, (x) => {
          const left = sitesOf(x).filter((s) => s !== page.url);
          return { ...x, stayAlive: { ...x.stayAlive, sites: left, url: left[0] || "" } };
        });
        await forgetSite(email, page.url);
        return res.status(200).json(await me(email));
      }
      if (pageKind(page.url) !== "web") return res.status(400).json({ error: "Use a public web page, not a store listing, file, or login page." });
      if (sites.includes(page.url)) return res.status(409).json({ error: "That site is already being watched." });
      if (sites.length >= seatsOf(u)) return res.status(402).json({ error: "Every site you pay for is in use. Add a site slot first.", needSeat: true });
      await updateUser(email, (x) => {
        const next = [...sitesOf(x), page.url];
        return { ...x, stayAlive: { ...x.stayAlive, sites: next, url: next[0] } };
      });
      waitUntil(runMonitor(email, { restamp: true, url: page.url }).catch((e) => console.error("Monitor failed:", e)));
      return res.status(202).json(await me(email));
    }
    if (op === "public-status") {
      const u = await getUser(email);
      if (!hasStayAlive(u)) return res.status(403).json({ error: "Stay Alive isn't on for this account." });
      const page = checkPageUrl(b.url);
      if (!page.url || !sitesOf(u).includes(page.url)) return res.status(404).json({ error: "That site isn't on your account." });
      await setPublicStatus(email, page.url, !!b.on);
      return res.status(200).json(await me(email));
    }
    if (op === "report-now") {
      const u = await getUser(email);
      if (!hasStayAlive(u)) return res.status(403).json({ error: "Stay Alive isn't on for this account." });
      const page = checkPageUrl(b.url);
      if (!page.url || !sitesOf(u).includes(page.url)) return res.status(404).json({ error: "That site isn't on your account." });
      await sendReportNow(email, page.url);
      return res.status(200).json(await me(email));
    }
    // How many sites Stay Alive covers: 1 with the plan, each extra one $5 a month, prorated.
    if (op === "seats") {
      await setStayAliveSeats(email, b.seats);
      return res.status(200).json(await me(email));
    }
    if (op === "restamp") {
      const u = await getUser(email);
      if (!hasKillSheet(u)) return res.status(403).json({ error: "The Kill Sheet isn't on this account." });
      if (!(u.killSheet.restampsLeft > 0)) return res.status(403).json({ error: "Your free re-stamp is used. Stamp the page free from the homepage any time." });
      if (!u.killSheet.url) return res.status(400).json({ error: "Add the page first." });
      const before = await readReport(email);
      await updateUser(email, (x) => ({ ...x, killSheet: { ...x.killSheet, restampsLeft: x.killSheet.restampsLeft - 1, lastRestampAt: new Date().toISOString(), before: before?.stamp || null } }));
      waitUntil(runScout(email, u.killSheet.url).catch((e) => console.error("Re-stamp failed:", e)));
      return res.status(202).json(await me(email));
    }
    if (op === "cancel" || op === "resume") {
      if (!polarApiReady()) return res.status(200).json({ portal: PORTAL });
      await (op === "cancel" ? cancelStayAlive(email) : resumeStayAlive(email));
      return res.status(200).json(await me(email));
    }
    if (op === "review") {
      const review = await submitReview(email, b);
      return res.status(201).json({ review, ...(await me(email)) });
    }
    if (op === "revoke") {
      const id = String(b.id || "");
      await remove(`cred:${id}`);
      await updateUser(email, (u) => (u ? { ...u, reviews: (u.reviews || []).map((r) => (r.id === id && r.login === "stored" ? { ...r, login: "revoked", loginGoneAt: new Date().toISOString() } : r)) } : undefined));
      return res.status(200).json(await me(email));
    }
    if (op === "delete") {
      if (String(b.confirm || "") !== "DELETE") return res.status(400).json({ error: "Type DELETE to confirm." });
      const u = await getUser(email);
      if (hasStayAlive(u) && !u.stayAlive.cancelAtPeriodEnd) return res.status(409).json({ error: "Cancel Stay Alive first, so you aren't billed for a page nobody watches." });
      await Promise.all([...(u?.reviews || []).map((r) => remove(`cred:${r.id}`)), remove(`report:${email}`), ...sitesOf(u).map((s) => forgetSite(email, s)), remove(`uid:${u?.id}`), ...(u?.x?.id ? [remove(`xid:${u.x.id}`)] : []), remove(userKey(email))]);
      await endSession(req, res);
      return res.status(200).json({ user: null, deleted: true });
    }
    return res.status(400).json({ error: "Unknown request." });
  } catch (err) {
    if (!err.status) console.error("Account op failed:", op, err);
    return res.status(err.status || 500).json({ error: err.status ? err.message : "Something broke on our side. Try again." });
  }
}

