import { DESK } from "../src/config.js";
import { renderAnalytics } from "./analytics.js";

// The desk: app reviews to work on, members, analytics, and what's connected. Everything goes through /api/admin
// (and /api/analytics) with the admin key, which lives in this tab's session storage only.
(() => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids.filter((k) => k != null && k !== false));
    return n;
  };
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");

  const session = {
    get() { try { return sessionStorage.getItem("doa.key") || ""; } catch (_) { return ""; } },
    set(v) { try { v ? sessionStorage.setItem("doa.key", v) : sessionStorage.removeItem("doa.key"); } catch (_) {} },
  };
  let key = session.get();

  async function call(op, body) {
    const r = await fetch(`/api/admin?op=${op}`, body ? { method: "POST", headers: { "x-admin-key": key, "Content-Type": "application/json" }, body: JSON.stringify({ op, ...body }) } : { headers: { "x-admin-key": key }, cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Error ${r.status}.`);
    return data;
  }

  $("queue").textContent = DESK.queueOpen
    ? "Free stamping is on. To pause it, set queueOpen to false in src/config.js and deploy."
    : "Free stamping is paused. To turn it on, set queueOpen to true in src/config.js and deploy.";

  // Unlock

  const unlock = $("unlock");
  unlock.addEventListener("submit", (e) => {
    e.preventDefault();
    key = String(new FormData(unlock).get("key") || "");
    openDesk();
  });
  $("lock").addEventListener("click", () => {
    key = "";
    session.set("");
    $("desk-nav").hidden = true;
    document.querySelectorAll(".pane").forEach((p) => (p.hidden = true));
    unlock.hidden = false;
  });

  let setup = {};
  async function openDesk() {
    const alert = unlock.querySelector("[role=alert]");
    alert.hidden = true;
    try {
      setup = (await call("session")).setup || {};
    } catch (err) {
      alert.hidden = false;
      alert.textContent = err.message === "Not available." ? "The desk is off: the admin key isn't set up in Vercel yet." : err.message || "Could not open the desk.";
      if (/key/i.test(String(err.message))) session.set("");
      return;
    }
    session.set(key);
    unlock.hidden = true;
    $("desk-nav").hidden = false;
    renderSetup();
    showPane(pane);
  }

  let pane = "reviews";
  function showPane(name) {
    pane = name;
    document.querySelectorAll(".desk-tabs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pane === name)));
    for (const p of ["reviews", "members", "analytics", "setup"]) $(`pane-${p}`).hidden = p !== name;
    if (name === "reviews") loadReviews();
    if (name === "members") loadMembers();
    if (name === "analytics") loadAnalytics();
  }
  document.querySelectorAll(".desk-tabs button").forEach((b) => b.addEventListener("click", () => showPane(b.dataset.pane)));

  // Reviews

  let reviews = [];
  let view = "open";
  document.querySelectorAll(".rv-tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      view = b.dataset.view;
      document.querySelectorAll(".rv-tabs button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      renderReviews();
    })
  );
  $("rv-refresh").addEventListener("click", loadReviews);

  async function loadReviews() {
    $("rv-alert").hidden = true;
    try {
      reviews = (await call("reviews")).reviews || [];
    } catch (err) {
      $("rv-alert").hidden = false;
      $("rv-alert").textContent = err.message;
      return;
    }
    renderReviews();
  }

  const LABEL = { received: "Received", in_review: "In review", delivered: "Delivered" };
  const lines = (v) => (Array.isArray(v) ? v.join("\n") : "");

  function renderReviews() {
    const shown = reviews.filter((r) => view === "all" || (view === "open" ? r.status !== "delivered" : r.status === "delivered"));
    const list = $("reviews");
    if (!shown.length) return list.replaceChildren(el("li", { className: "empty", textContent: view === "open" ? "No open reviews." : "Nothing here yet." }));
    list.replaceChildren(...shown.map(reviewItem));
  }

  function reviewItem(r) {
    const li = el("li", { className: "order" });
    const head = el("div", { className: "who" }, el("strong", { textContent: r.siteUrl || r.appUrl }), el("span", { textContent: `${LABEL[r.status]} · ${r.plan === "killSheet" ? "Kill Sheet" : "Stay Alive"} · ${r.email}` }));
    const meta = el("div", { className: "meta" }, el("span", { textContent: `Sent ${fmt(r.createdAt)}` }), r.appUrl && r.siteUrl ? el("span", { textContent: `App: ${r.appUrl}` }) : null, el("span", { textContent: `Test login: ${r.login}` }));
    const what = el("p", { className: "rv-what", textContent: r.what });
    const out = el("p", { className: "alert", hidden: true });
    const loginBox = el("p", { className: "rv-login", hidden: true });

    const summary = el("textarea", { rows: 3, placeholder: "Summary: what a new user experiences, in two or three sentences.", value: r.result?.summary || "" });
    const problems = el("textarea", { rows: 4, placeholder: "Problems found, one per line.", value: lines(r.result?.problems) });
    const fixes = el("textarea", { rows: 4, placeholder: "Fixes, ranked, one per line.", value: lines(r.result?.fixes) });
    const copy = el("textarea", { rows: 4, placeholder: "Rewritten copy (headline, subhead, buttons, onboarding text).", value: r.result?.copy || "" });
    const result = () => ({ summary: summary.value, problems: problems.value.split("\n"), fixes: fixes.value.split("\n"), copy: copy.value });

    async function move(status) {
      out.hidden = true;
      try {
        const { review } = await call("review", { email: r.email, id: r.id, status, result: result() });
        Object.assign(r, review);
        renderReviews();
      } catch (err) {
        out.hidden = false;
        out.textContent = err.message;
      }
    }
    async function showLogin() {
      out.hidden = true;
      try {
        const { login } = await call("login", { email: r.email, id: r.id });
        loginBox.hidden = false;
        loginBox.textContent = `Email: ${login.email}  ·  Password: ${login.password}`;
      } catch (err) {
        out.hidden = false;
        out.textContent = err.message;
      }
    }

    const actions = el("div", { className: "actions" });
    if (r.status === "received") actions.append(el("button", { type: "button", className: "submit", textContent: "Start review (In review)", onclick: () => move("in_review") }));
    if (r.status === "in_review") {
      if (r.login === "stored") actions.append(el("button", { type: "button", className: "submit ghost", textContent: "Show test login", onclick: showLogin }));
      actions.append(el("button", { type: "button", className: "submit ghost", textContent: "Save draft", onclick: () => move("in_review") }));
      actions.append(el("button", { type: "button", className: "submit", textContent: "Deliver to dashboard", onclick: () => move("delivered") }));
    }
    const form = r.status === "received" ? null : el("div", { className: "rv-form" }, summary, problems, fixes, copy);
    li.append(head, meta, what, loginBox, form, actions, out);
    return li;
  }

  // Members

  $("mb-refresh").addEventListener("click", loadMembers);
  async function loadMembers() {
    $("mb-alert").hidden = true;
    let data;
    try {
      data = await call("members");
    } catch (err) {
      $("mb-alert").hidden = false;
      $("mb-alert").textContent = err.message;
      return;
    }
    const list = $("members");
    const ms = data.members || [];
    if (!ms.length) return list.replaceChildren(el("li", { className: "empty", textContent: `No members yet. ${data.accounts || 0} free accounts.` }));
    list.replaceChildren(
      el("li", { className: "empty", textContent: `${ms.length} members of ${data.accounts} accounts.` }),
      ...ms.map((m) => {
        const plans = [
          m.killSheet && `Kill Sheet${m.killSheet.active ? "" : " (refunded)"} since ${fmt(m.killSheet.since)}${m.killSheet.url ? ` · ${m.killSheet.url}` : " · no page yet"}`,
          m.stayAlive && `Stay Alive ${m.stayAlive.status}${m.stayAlive.cancelAtPeriodEnd ? " (cancels at period end)" : ""} · renews ${fmt(m.stayAlive.renews)}${m.stayAlive.url ? ` · ${m.stayAlive.url}` : " · no page yet"}`,
        ].filter(Boolean);
        const li = el("li", { className: "order" }, el("div", { className: "who" }, el("strong", { textContent: m.email }), el("span", { textContent: `${m.stamps} stamps` })), ...plans.map((p) => el("div", { className: "meta", textContent: p })));
        if (m.killSheet?.url) {
          const msg = el("span", { className: "meta" });
          li.append(el("div", { className: "actions" }, el("button", { type: "button", className: "submit ghost", textContent: "Run Kill Sheet again", onclick: async () => {
            try {
              await call("rescout", { email: m.email });
              msg.textContent = "Started. It shows in their dashboard in about a minute.";
            } catch (err) {
              msg.textContent = err.message;
            }
          } }), msg));
        }
        return li;
      })
    );
  }

  // Analytics

  let days = 30;
  document.querySelectorAll(".range-tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      days = Number(b.dataset.days);
      document.querySelectorAll(".range-tabs button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      loadAnalytics();
    })
  );
  $("an-refresh").addEventListener("click", () => loadAnalytics());
  async function loadAnalytics() {
    const body = $("an-body");
    body.classList.add("loading");
    try {
      const r = await fetch(`/api/analytics?days=${days}`, { headers: { "x-admin-key": key }, cache: "no-store" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Error ${r.status}.`);
      $("an-notes").replaceChildren(...(data.notes || []).map((n) => el("li", { textContent: n })));
      renderAnalytics(body, data);
    } catch (err) {
      body.replaceChildren(el("p", { className: "alert", textContent: err.message || "Could not load analytics." }));
    } finally {
      body.classList.remove("loading");
    }
  }

  // Setup

  function renderSetup() {
    const items = [
      ["Admin key", true, "Set. You're in."],
      ["Free stamps", true, "Homepage stamps are scored by rules (no AI): headline, audience, next step, buttons, speed, phone, https, tags."],
      ["Accounts", setup.accounts, setup.accounts ? (setup.analytics ? "Accounts, sessions, and reviews are stored in Upstash Redis." : "Accounts are stored in Vercel Blob under hashed paths. Connect Upstash Redis for faster sign-ins.") : "Connect Upstash Redis (or Blob plus RESULT_SECRET) so people can create accounts."],
      ["Polar webhook", setup.webhook, setup.webhook ? "Payments switch memberships on instantly." : "Add POLAR_WEBHOOK_SECRET (Polar → Settings → Webhooks → the stampmypage.com/api/polar endpoint → Secret). Until then, payments don't reach dashboards."],
      ["Polar API token", setup.polarApi, setup.polarApi ? "Checkouts are confirmed the moment the buyer lands back, and members can cancel from the dashboard." : "Optional: POLAR_ACCESS_TOKEN (scopes: checkouts:read, subscriptions:read, subscriptions:write). Without it, the webhook switches plans on and Cancel opens Polar's customer portal."],
      ["Email", setup.email, setup.email ? "Sign-in links and down alerts are emailed." : "Add RESEND_API_KEY and MAIL_FROM for email sign-in links and down alerts. Passwords work without it."],
      ["Daily monitoring", true, setup.cron ? "Vercel cron runs Stay Alive checks every day, signed with CRON_SECRET." : "Vercel cron runs Stay Alive checks every day. Optional: set CRON_SECRET so only Vercel can trigger it."],
      ["Screenshots", true, setup.screenshots ? "Using your Microlink plan." : "Using Microlink's free tier (about 50 a day). Add MICROLINK_API_KEY for more."],
      ["Stamp storage", setup.blob, setup.blob ? "Published stamps are saved to Vercel Blob." : "Connect a Blob store in Vercel → Storage. It adds BLOB_READ_WRITE_TOKEN."],
      ["Visitor analytics", setup.analytics, setup.analytics ? "Visits and clicks are being counted." : "Add Upstash Redis from the Vercel Marketplace (Storage → Upstash). It adds KV_REST_API_URL and KV_REST_API_TOKEN."],
      ["Site address", setup.siteUrl, setup.siteUrl ? "Links and share previews use SITE_URL." : "Optional: set SITE_URL to your domain. Vercel's production domain is used until then."],
      ["Contact email", setup.contact, setup.contact ? "Shown on the privacy and terms pages, and told when a review comes in." : "Set CONTACT_EMAIL so the privacy and terms pages show it and you hear about new reviews."],
    ];
    $("setup-list").replaceChildren(
      ...items.map(([name, ok, text]) =>
        el("li", { className: ok ? "ok" : "todo" }, el("span", { className: "setup-badge", textContent: ok ? "Connected" : "Missing" }), el("strong", { textContent: name }), el("p", { textContent: text }))
      )
    );
  }

  $("recards").addEventListener("click", async () => {
    const btn = $("recards"), note = $("recards-note");
    btn.disabled = true;
    let cursor = "", total = 0;
    try {
      do {
        const out = await call("recards", { cursor });
        total += out.done;
        cursor = out.cursor;
        note.textContent = `Redrawn ${total} so far…`;
      } while (cursor);
      note.textContent = `Done. ${total} stamps have the new share cards.`;
    } catch (err) {
      note.textContent = `Stopped after ${total}: ${err.message}`;
    } finally {
      btn.disabled = false;
    }
  });

  if (key) openDesk();
})();
