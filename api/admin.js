// Admin-only. The desk: what's connected, members, and app reviews. One route by ?op= (Vercel's 12-function limit).
//   GET  session                   checks the key, reports setup
//   GET  members                   every account with a plan
//   GET  reviews                   every app review, newest first (no test logins)
//   POST login { email, id }       shows a review's test login, only while it's In review
//   POST review { email, id, status, result }  moves a review along; Delivered deletes its test login
//   POST rescout { email }         runs a member's Kill Sheet again
//   POST recards { cursor }        redraws published stamps' share cards in the current design, about 10 per call
// Env: ADMIN_KEY.
import { waitUntil } from "@vercel/functions";
import { polarReady, requireAdmin } from "./_lib.js";
import { redisReady } from "./_redis.js";
import { get, members, remove, storeReady, unseal } from "./_store.js";
import { getUser, hasKillSheet, hasStayAlive, updateUser } from "./_account.js";
import { polarApiReady } from "./_billing.js";
import { runScout } from "./_scout.js";
import { redrawCards } from "./_publish.js";
import { list as listBlobs } from "@vercel/blob";

const STATUSES = ["received", "in_review", "delivered"];
const list = (v, n = 20, len = 600) => (Array.isArray(v) ? v : String(v || "").split("\n")).map((s) => String(s).trim()).filter(Boolean).slice(0, n).map((s) => s.slice(0, len));

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const op = String(req.query?.op || b.op || "session");

  if (op === "session") {
    const x = {
      polar: polarReady(),
      polarApi: polarApiReady(),
      webhook: !!process.env.POLAR_WEBHOOK_SECRET,
      accounts: storeReady(),
      blob: !!process.env.BLOB_READ_WRITE_TOKEN,
      screenshots: !!process.env.MICROLINK_API_KEY,
      email: !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM),
      analytics: redisReady(),
      cron: !!process.env.CRON_SECRET,
      siteUrl: !!process.env.SITE_URL,
      contact: !!process.env.CONTACT_EMAIL,
    };
    const items = [
      ["Admin key", true, "Set. You're in."],
      ["Free stamps", true, "Homepage stamps are scored by rules: headline, audience, next step, buttons, speed, phone, https, tags."],
      ["Accounts", x.accounts, x.accounts ? (x.analytics ? "Accounts, sessions, and reviews are stored in Upstash Redis." : "Accounts are stored in Vercel Blob under hashed paths. Connect Upstash Redis for faster sign-ins.") : "Connect Upstash Redis (or Blob plus RESULT_SECRET) so people can create accounts."],
      ["Polar webhook", x.webhook, x.webhook ? "Payments switch memberships on instantly." : "Add POLAR_WEBHOOK_SECRET (Polar → Settings → Webhooks → the /api/polar endpoint → Secret). Until then, payments don't reach dashboards."],
      ["Polar API token", x.polarApi, x.polarApi ? "Checkouts are confirmed the moment the buyer lands back, and members can cancel from the dashboard." : "Optional: POLAR_ACCESS_TOKEN (checkouts:read, subscriptions:read, subscriptions:write). Without it, the webhook switches plans on and Cancel opens the customer portal."],
      ["Email", x.email, x.email ? "Sign-in links and down alerts are emailed." : "Add RESEND_API_KEY and MAIL_FROM for email sign-in links and down alerts. Passwords work without it."],
      ["Daily monitoring", true, x.cron ? "Vercel cron runs Stay Alive checks every day, signed with CRON_SECRET." : "Vercel cron runs Stay Alive checks every day. Optional: set CRON_SECRET so only Vercel can trigger it."],
      ["Screenshots", true, x.screenshots ? "Using your Microlink plan." : "Using Microlink's free tier (about 50 a day). Add MICROLINK_API_KEY for more."],
      ["Stamp storage", x.blob, x.blob ? "Published stamps are saved to Vercel Blob." : "Connect a Blob store in Vercel → Storage. It adds BLOB_READ_WRITE_TOKEN."],
      ["Visitor analytics", x.analytics, x.analytics ? "Visits and clicks are being counted." : "Add Upstash Redis from the Vercel Marketplace. It adds KV_REST_API_URL and KV_REST_API_TOKEN."],
      ["Site address", x.siteUrl, x.siteUrl ? "Links and share previews use SITE_URL." : "Set SITE_URL to your domain (for example https://stampmypage.com). The production domain is used until then."],
      ["Contact email", x.contact, x.contact ? "Shown on the privacy and terms pages, and told when a review comes in." : "Set CONTACT_EMAIL so the privacy and terms pages show it and you hear about new reviews."],
    ];
    return res.status(200).json({ ok: true, setup: { ...x, items } });
  }

  if (op === "members") {
    const emails = await members("idx:users");
    const users = (await Promise.all(emails.slice(-500).map((e) => getUser(e)))).filter(Boolean);
    return res.status(200).json({
      members: users
        .filter((u) => u.killSheet || u.stayAlive)
        .map((u) => ({ email: u.email, createdAt: u.createdAt, killSheet: u.killSheet ? { since: u.killSheet.since, url: u.killSheet.url, active: hasKillSheet(u), restampsLeft: u.killSheet.restampsLeft } : null, stayAlive: u.stayAlive ? { status: u.stayAlive.status, since: u.stayAlive.since, renews: u.stayAlive.renews, cancelAtPeriodEnd: u.stayAlive.cancelAtPeriodEnd, url: u.stayAlive.url, active: hasStayAlive(u) } : null, stamps: (u.stamps || []).length })),
      accounts: users.length,
    });
  }

  if (op === "reviews") {
    const keys = await members("idx:reviews");
    const emails = [...new Set(keys.map((k) => k.split("|")[0]))];
    const users = (await Promise.all(emails.map((e) => getUser(e)))).filter(Boolean);
    const reviews = users.flatMap((u) => (u.reviews || []).map((r) => ({ ...r, email: u.email, member: { killSheet: hasKillSheet(u), stayAlive: hasStayAlive(u) } })));
    reviews.sort((a, z) => String(z.createdAt).localeCompare(String(a.createdAt)));
    return res.status(200).json({ reviews });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });
  const email = String(b.email || "").toLowerCase();
  const id = String(b.id || "");

  if (op === "login") {
    const u = await getUser(email);
    const r = (u?.reviews || []).find((x) => x.id === id);
    if (!r) return res.status(404).json({ error: "No such review." });
    if (r.status !== "in_review") return res.status(409).json({ error: "Move the review to In review first. Test logins are only shown while you're testing." });
    const c = await get(`cred:${id}`);
    if (!c?.sealed) return res.status(404).json({ error: r.login === "revoked" ? "The member revoked this login." : "No test login stored." });
    console.log(`Test login shown for review ${id}.`);
    return res.status(200).json({ login: JSON.parse(unseal(c.sealed)) });
  }

  if (op === "review") {
    const status = String(b.status || "");
    if (!STATUSES.includes(status)) return res.status(400).json({ error: "Status is received, in_review, or delivered." });
    const result = b.result
      ? {
          summary: String(b.result.summary || "").trim().slice(0, 2000),
          problems: list(b.result.problems),
          fixes: list(b.result.fixes),
          copy: String(b.result.copy || "").trim().slice(0, 4000),
        }
      : null;
    if (status === "delivered" && !(result?.summary || result?.problems.length || result?.fixes.length)) return res.status(400).json({ error: "Write the result before delivering." });
    const now = new Date().toISOString();
    if (status === "delivered") await remove(`cred:${id}`);
    const u = await updateUser(email, (x) =>
      x
        ? {
            ...x,
            reviews: (x.reviews || []).map((r) =>
              r.id === id
                ? { ...r, status, updatedAt: now, ...(result ? { result } : {}), ...(status === "delivered" ? { deliveredAt: now, ...(r.login === "stored" ? { login: "deleted", loginGoneAt: now } : {}) } : {}) }
                : r
            ),
          }
        : undefined
    );
    if (!u) return res.status(404).json({ error: "No such member." });
    return res.status(200).json({ review: u.reviews.find((r) => r.id === id) });
  }

  if (op === "rescout") {
    const u = await getUser(email);
    if (!hasKillSheet(u) || !u.killSheet.url) return res.status(400).json({ error: "No Kill Sheet with a page on this account." });
    waitUntil(runScout(email, u.killSheet.url).catch((e) => console.error("Rescout failed:", e)));
    return res.status(202).json({ started: true });
  }

  if (op === "recards") {
    const page = await listBlobs({ prefix: "verdicts/", limit: 40, cursor: b.cursor || undefined });
    const ids = page.blobs.map((x) => (/^verdicts\/([A-Za-z0-9_-]+)\.json$/.exec(x.pathname) || [])[1]).filter(Boolean);
    let done = 0;
    for (const id of ids) if (await redrawCards(id).catch((e) => console.error("Redraw failed:", id, e))) done++;
    return res.status(200).json({ done, cursor: page.hasMore ? page.cursor : "" });
  }

  return res.status(400).json({ error: "Unknown op." });
}
