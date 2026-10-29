// Admin-only. The desk: what's connected, members, and app reviews. One route by ?op= (Vercel's 12-function limit).
//   GET  session                   checks the key, reports setup
//   GET  members                   every account with a plan
//   GET  reviews                   every app review, newest first (no test logins)
//   GET  stamps&page=N             every published stamp, newest first, 40 a page, with the account it's saved to
//   GET  stamp&id=ID               one stamp in full: checks, stack, speed, SEO, security
//   GET  users                     every account, free or paid
//   GET  payments                  every subscription and Kill Sheet order, the account it belongs to, and the payment log
//   POST sync { email }            asks the payment provider what an account paid for and switches it on
//   POST login { email, id }       shows a review's test login, only while it's In review
//   POST review { email, id, status, result }  moves a review along; Delivered deletes its test login
//   POST rescout { email }         runs a member's Kill Sheet again
//   POST grant-restamp { email }   gives a member with an active Kill Sheet one more free re-stamp
//   POST grant-compare { email }   gives a member's Kill Sheet one more competitor comparison
//   POST recards { cursor }        redraws published stamps' share cards in the current design, about 10 per call
// Env: ADMIN_KEY.
import { waitUntil } from "@vercel/functions";
import { polarReady, requireAdmin } from "./_lib.js";
import { readFullResult } from "./_gate.js";
import { redisReady } from "./_redis.js";
import { get, members, remove, set, storeReady, unseal } from "./_store.js";
import { getUser, hasKillSheet, hasStayAlive, updateUser } from "./_account.js";
import { paymentsOverview, polarApiReady, reconcile } from "./_billing.js";
import { comparesLeft, readReport, reportKey, runScout } from "./_scout.js";
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
      resultSecret: !!process.env.RESULT_SECRET,
    };
    const items = [
      ["Admin key", true, "Set. You're in."],
      ["Free stamps", true, "Homepage stamps are scored by rules: headline, audience, next step, buttons, speed, phone, https, tags."],
      ["Accounts", x.accounts, x.accounts ? (x.analytics ? "Accounts, sessions, and reviews are stored in Upstash Redis." : "Accounts are stored in Vercel Blob under hashed paths. Connect Upstash Redis for faster sign-ins.") : "Connect Upstash Redis (or Blob plus RESULT_SECRET) so people can create accounts."],
      ["Polar webhook", x.webhook, x.webhook ? "Payments switch memberships on instantly." : "Add POLAR_WEBHOOK_SECRET (Polar → Settings → Webhooks → the /api/polar endpoint → Secret). Until then, payments don't reach dashboards."],
      ["Polar API token", x.polarApi, x.polarApi ? "Checkouts are confirmed the moment the buyer lands back, and members can cancel from the dashboard." : "Optional: POLAR_ACCESS_TOKEN (checkouts:read, subscriptions:read, subscriptions:write). Without it, the webhook switches plans on and Cancel opens the customer portal."],
      ["Sign in with X", true, process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET ? "Continue with X goes to X directly (X_CLIENT_ID and X_CLIENT_SECRET)." : "Continue with X runs through your Supabase project's X provider. In Supabase → Authentication → URL Configuration, add https://<your domain>/auth/x/callback to Redirect URLs and set Site URL to your domain. The X app needs Request email from users on."],
      ["Email", x.email, x.email ? "Down alerts, change alerts, and new-review notices are emailed." : "Needed: Stay Alive promises an email when a page goes down or changes, and you're told about new app reviews by email. Add RESEND_API_KEY and MAIL_FROM (an address on a domain verified in Resend)."],
      ["Separate stamp secret", x.resultSecret, x.resultSecret ? "Stamp links and saved test logins use RESULT_SECRET, so the admin key can change safely." : "Add RESULT_SECRET with the same value as your current ADMIN_KEY. Then changing the admin key later won't stop people saving earlier stamps or break stored test logins."],
      ["Daily monitoring", x.cron, x.cron ? "Vercel cron runs Stay Alive checks every day, signed with CRON_SECRET." : "Add CRON_SECRET (any long random text). Vercel then signs the daily Stay Alive run, so nobody else can start it."],
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
    // Comparisons left live on each Kill Sheet report, so read those for Kill Sheet members only.
    const left = Object.fromEntries(await Promise.all(users.filter((u) => u.killSheet).map(async (u) => [u.email, comparesLeft(await readReport(u.email).catch(() => null))])));
    return res.status(200).json({
      members: users
        .filter((u) => u.killSheet || u.stayAlive)
        .map((u) => ({ email: u.email, createdAt: u.createdAt, killSheet: u.killSheet ? { since: u.killSheet.since, url: u.killSheet.url, active: hasKillSheet(u), restampsLeft: u.killSheet.restampsLeft, comparesLeft: left[u.email] ?? null } : null, stayAlive: u.stayAlive ? { interval: u.stayAlive.interval || "month", seats: u.stayAlive.seats || 1, sites: (u.stayAlive.sites || (u.stayAlive.url ? [u.stayAlive.url] : [])).length, status: u.stayAlive.status, since: u.stayAlive.since, renews: u.stayAlive.renews, cancelAtPeriodEnd: u.stayAlive.cancelAtPeriodEnd, url: u.stayAlive.url, active: hasStayAlive(u) } : null, stamps: (u.stamps || []).length })),
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

  if (op === "stamps") {
    const blobs = [];
    let cursor;
    do {
      const page = await listBlobs({ prefix: "verdicts/", cursor, limit: 1000 });
      blobs.push(...page.blobs.filter((x) => /^verdicts\/[A-Za-z0-9_-]+\.json$/.test(x.pathname)));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    blobs.sort((a, z) => new Date(z.uploadedAt) - new Date(a.uploadedAt));
    const per = 40, pageNo = Math.max(0, parseInt(req.query.page || "0", 10) || 0);
    const slice = blobs.slice(pageNo * per, (pageNo + 1) * per);
    // Which account saved each stamp.
    const owners = new Map();
    for (const u of (await Promise.all((await members("idx:users")).map((e) => getUser(e)))).filter(Boolean)) for (const st of u.stamps || []) owners.set(st.id, u.email);
    const hiddenRaw = await get("carousel:hidden").catch(() => null);
    const hiddenSet = new Set(Array.isArray(hiddenRaw) ? hiddenRaw.map((h) => String(h).toLowerCase().trim()) : []);
    const rows = await Promise.all(
      slice.map(async (x) => {
        const id = x.pathname.slice(9, -5);
        const r = await fetch(`${x.url}?t=${Date.parse(x.uploadedAt) || 0}`).then((y) => (y.ok ? y.json() : null)).catch(() => null);
        if (!r) return null;
        const checks = Array.isArray(r.checks) ? r.checks.filter((k) => !k.skip) : [];
        const snap = r.snapshot || (await get(`snap:${id}`).catch(() => null));
        // Who claimed it: this stamp's claim, or its host's claim inherited by re-stamps.
        // Admin-only: email is shown here, never on the public result page.
        let claimed = null;
        try {
          const hostKey = r.host ? String(r.host).toLowerCase().trim() : "";
          let claimEmail = await get(`claim:${id}`).catch(() => null);
          if (claimEmail && hostKey) {
            const hostClaim = await get(`claimhost:${hostKey}`).catch(() => null);
            if (!hostClaim) await set(`claimhost:${hostKey}`, claimEmail).catch(() => {});
          }
          if (!claimEmail && hostKey) claimEmail = await get(`claimhost:${hostKey}`).catch(() => null);
          if (claimEmail) {
            const cu = await getUser(claimEmail);
            claimed = { email: claimEmail, username: cu?.x?.username || "", name: cu?.x?.name || "" };
          }
        } catch (_) {}
        return {
          id, number: r.number, host: r.host, pageUrl: r.pageUrl, verdict: r.verdict, score: r.score ?? null, createdAt: r.createdAt, icon: r.icon || "",
          failed: checks.filter((k) => !k.pass).map((k) => k.label), stack: (snap?.stack || []).length, lcp: snap?.browser?.lcp || null,
          owner: owners.get(id) || "",
          claimed, hidden: hiddenSet.has(String(r.host || "").toLowerCase().trim()),
        };
      })
    );
    return res.status(200).json({ stamps: rows.filter(Boolean), total: blobs.length, page: pageNo, pages: Math.ceil(blobs.length / per), hiddenHosts: [...hiddenSet] });
  }

  if (op === "stamp") {
    const r = await readFullResult(String(req.query.id || ""));
    return r ? res.status(200).json({ stamp: r }) : res.status(404).json({ error: "No such stamp." });
  }

  if (op === "users") {
    const users = (await Promise.all((await members("idx:users")).map((e) => getUser(e)))).filter(Boolean);
    users.sort((a, z) => String(z.createdAt).localeCompare(String(a.createdAt)));
    return res.status(200).json({
      users: users.map((u) => ({
        email: u.email, createdAt: u.createdAt, password: !!u.pass, x: u.x?.username || "", stamps: (u.stamps || []).length,
        killSheet: hasKillSheet(u), stayAlive: hasStayAlive(u), stayAliveStatus: u.stayAlive?.status || "", reviews: (u.reviews || []).length,
        lastStamp: (u.stamps || [])[0]?.host || "",
      })),
    });
  }

  if (op === "payments") return res.status(200).json(await paymentsOverview());

  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });

  if (op === "carousel-hide" || op === "carousel-show") {
    const host = String(b.host || "").toLowerCase().trim();
    if (!host) return res.status(400).json({ error: "Which site?" });
    const raw = await get("carousel:hidden").catch(() => null);
    let hidden = Array.isArray(raw) ? raw.map((h) => String(h).toLowerCase().trim()).filter(Boolean) : [];
    if (op === "carousel-hide") { if (!hidden.includes(host)) hidden.push(host); }
    else hidden = hidden.filter((h) => h !== host);
    await set("carousel:hidden", hidden);
    return res.status(200).json({ ok: true, host, hidden, hiddenHosts: hidden });
  }

  if (op === "sync") {
    const email = String(b.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "Which account?" });
    return res.status(200).json({ result: await reconcile(email) });
  }
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

  if (op === "grant-restamp") {
    const u = await getUser(email);
    if (!u) return res.status(404).json({ error: "No such member." });
    if (!hasKillSheet(u)) return res.status(400).json({ error: "No active Kill Sheet on this account." });
    await updateUser(email, (x) => ({ ...x, killSheet: { ...x.killSheet, restampsLeft: (x.killSheet.restampsLeft || 0) + 1 } }));
    const after = await getUser(email);
    return res.status(200).json({ restampsLeft: after?.killSheet?.restampsLeft || 0 });
  }

  if (op === "grant-compare") {
    const u = await getUser(email);
    if (!u) return res.status(404).json({ error: "No such member." });
    if (!hasKillSheet(u)) return res.status(400).json({ error: "No active Kill Sheet on this account." });
    const r = await readReport(email);
    if (r?.status !== "ready") return res.status(400).json({ error: "This member's Kill Sheet isn't ready yet." });
    await set(reportKey(email), { ...r, rivalsBonus: (r.rivalsBonus || 0) + 1, rivalError: null });
    return res.status(200).json({ comparesLeft: comparesLeft(await readReport(email)) });
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
