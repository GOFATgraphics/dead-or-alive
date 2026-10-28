import "../src/result.css";
import "../src/dashboard.css";
import "./admin.css";
import { DESK } from "../src/config.js";
import { PATHS } from "../src/icon-paths.js";
import { barChart, renderAnalytics } from "./analytics.js";

// The admin page: an overview, stamps, accounts, members, app reviews, analytics, and setup. Everything goes
// through /api/admin (and /api/analytics) with the admin key, which lives in this tab's session storage only.
// All text from the data goes in with textContent.
(() => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) k === "role" || k.startsWith("aria-") ? n.setAttribute(k, v) : (n[k] = v);
    n.append(...kids.flat().filter((k) => k != null && k !== false && k !== ""));
    return n;
  };
  const icon = (name) => {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [k, v] of Object.entries({ class: "ic", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) s.setAttribute(k, v);
    s.innerHTML = PATHS[name] || "";
    return s;
  };
  const nf = new Intl.NumberFormat();
  const num = (v) => (v == null ? "n/a" : nf.format(v));
  const date = (iso) => (iso ? new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "");
  const stamp = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");
  function ago(iso) {
    if (!iso) return "";
    const s = (Date.now() - Date.parse(iso)) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 86400 * 14) return `${Math.floor(s / 86400)}d ago`;
    return date(iso);
  }
  const chip = (text, tone = "") => el("span", { className: `ad-chip ${tone}`, textContent: text });
  const vchip = (v) => el("span", { className: `ad-chip v-${String(v || "").toLowerCase()}`, textContent: v || "?" });
  const muted = (text) => el("span", { className: "ad-muted", textContent: text });
  const plural = (n, one, many = one + "s") => `${num(n)} ${n === 1 ? one : many}`;
  const KILL_SHEET = 19, STAY_ALIVE = 20, STAY_ALIVE_YEAR = 200, EXTRA_SITE = 5, EXTRA_SITE_YEAR = 50;
  // Monthly recurring revenue from active Stay Alive members, extra sites included: a yearly member counts as a
  // twelfth of the year.
  const mrrOf = (ms) => Math.round(ms.filter((m) => m.stayAlive?.active).reduce((a, m) => {
    const extra = Math.max(0, (m.stayAlive.seats || 1) - 1);
    return a + (m.stayAlive.interval === "year" ? (STAY_ALIVE_YEAR + extra * EXTRA_SITE_YEAR) / 12 : STAY_ALIVE + extra * EXTRA_SITE);
  }, 0));

  const session = {
    get() { try { return sessionStorage.getItem("doa.key") || ""; } catch (_) { return ""; } },
    set(v) { try { v ? sessionStorage.setItem("doa.key", v) : sessionStorage.removeItem("doa.key"); } catch (_) {} },
  };
  let key = session.get();

  // Expandable side panel: the collapsed state sticks in this browser.
  const sideClosed = {
    get() { try { return localStorage.getItem("smp.side") === "closed"; } catch (_) { return false; } },
    set(v) { try { v ? localStorage.setItem("smp.side", "closed") : localStorage.removeItem("smp.side"); } catch (_) {} },
  };
  function syncSide() {
    const closed = sideClosed.get();
    document.body.classList.toggle("side-closed", closed);
    const t = $("side-toggle");
    if (!t) return;
    t.setAttribute("aria-expanded", String(!closed));
    t.setAttribute("aria-label", closed ? "Expand sidebar" : "Collapse sidebar");
    t.title = closed ? "Expand sidebar" : "Collapse sidebar";
    t.replaceChildren(icon(closed ? "chevron-right" : "chevron-left"));
  }
  $("side-toggle").onclick = () => { sideClosed.set(!sideClosed.get()); syncSide(); };
  syncSide();

  // Sidebar search, in the reference shell's style: filters sections, ⌘K / Ctrl+K focuses it.
  const sideSearch = $("side-search");
  function applySideFilter() {
    const q = (sideSearch?.value || "").trim().toLowerCase();
    for (const g of document.querySelectorAll("#side-nav .side-group")) {
      let shown = 0;
      for (const b of g.querySelectorAll("button")) {
        const hit = !q || (b.querySelector(".side-label")?.textContent || "").toLowerCase().includes(q);
        b.hidden = !hit;
        if (hit) shown++;
      }
      g.hidden = shown === 0;
    }
  }
  sideSearch?.addEventListener("input", applySideFilter);
  sideSearch?.addEventListener("keydown", (e) => { if (e.key === "Escape") { sideSearch.value = ""; applySideFilter(); sideSearch.blur(); } });
  addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); sideSearch?.focus(); }
  });

  async function call(op, body) {
    const r = await fetch(`/api/admin?op=${op}`, body ? { method: "POST", headers: { "x-admin-key": key, "Content-Type": "application/json" }, body: JSON.stringify({ op, ...body }) } : { headers: { "x-admin-key": key }, cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Error ${r.status}.`);
    return data;
  }
  async function analytics(days) {
    const r = await fetch(`/api/analytics?days=${days}`, { headers: { "x-admin-key": key }, cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Error ${r.status}.`);
    return data;
  }

  // Data, fetched once per pane and again on Refresh.
  const cache = {};
  async function get(name, fn, fresh) {
    if (fresh || !cache[name]) cache[name] = fn().catch((err) => { delete cache[name]; throw err; });
    return cache[name];
  }
  const getStamps = (page, fresh) => get(`stamps:${page}`, () => call(`stamps&page=${page}`), fresh);
  const getUsers = (fresh) => get("users", async () => (await call("users")).users || [], fresh);
  const getMembers = (fresh) => get("members", () => call("members"), fresh);
  const getReviews = (fresh) => get("reviews", async () => (await call("reviews")).reviews || [], fresh);
  const getAnalytics = (days, fresh) => get(`an:${days}`, () => analytics(days), fresh);

  const fail = (id, err) => {
    const a = $(id);
    a.hidden = !err;
    if (err) a.textContent = err.message || String(err);
  };

  // A table. Rows with onRow open on click or Enter.
  function table(cols, rows, { onRow, empty = "Nothing here yet." } = {}) {
    if (!rows.length) return el("p", { className: "empty", textContent: empty });
    const head = el("tr", {}, cols.map((c) => el("th", { scope: "col", className: c.cls || "", textContent: c.label })));
    const body = rows.map((r) => {
      const tr = el("tr", {}, cols.map((c) => {
        const v = c.cell(r);
        return el("td", { className: c.cls || "" }, v instanceof Node ? v : String(v ?? ""));
      }));
      if (onRow) {
        tr.tabIndex = 0;
        tr.className = "go";
        tr.onclick = (e) => !e.target.closest("a, button") && onRow(r);
        tr.onkeydown = (e) => e.key === "Enter" && e.target === tr && onRow(r);
      }
      return tr;
    });
    return el("div", { className: "ad-table-wrap" }, el("table", { className: "ad-table" }, el("thead", {}, head), el("tbody", {}, body)));
  }

  function panel(title, desc, action, ...kids) {
    return el("section", { className: "panel" }, el("header", { className: "panel-head" }, el("div", {}, el("h2", { textContent: title }), desc ? el("p", { textContent: desc }) : null), action), ...kids);
  }
  const kpis = (items) => el("div", { className: "kpis ad-kpis" }, items.map(([label, value, sub, tone]) => el("div", {}, el("p", { textContent: label }), el("b", { className: tone || "", textContent: value }), sub ? el("small", { textContent: sub }) : null)));
  const site = (host, iconUrl, sub) => {
    const mark = iconUrl ? el("img", { src: iconUrl, alt: "", width: 18, height: 18, loading: "lazy" }) : el("i", { textContent: (host || "?")[0].toUpperCase() });
    if (iconUrl) mark.onerror = () => mark.replaceWith(el("i", { textContent: (host || "?")[0].toUpperCase() }));
    return el("span", { className: "ad-site" }, mark, el("span", {}, el("b", { textContent: host }), sub ? el("small", { textContent: sub }) : null));
  };
  const person = (email, sub) => el("span", { className: "ad-site" }, el("span", { className: "avatar", "aria-hidden": "true", textContent: (email || "?")[0].toUpperCase() }), el("span", {}, el("b", { textContent: email }), sub ? el("small", { textContent: sub }) : null));

  // Navigation

  const PANES = [
    ["overview", "Overview", "layout-grid", "Work"],
    ["stamps", "Stamps", "stamp", "Work"],
    ["reviews", "App reviews", "clipboard-list", "Work"],
    ["users", "Accounts", "users", "People and money"],
    ["members", "Members", "credit-card", "People and money"],
    ["payments", "Payments", "activity", "People and money"],
    ["analytics", "Analytics", "chart-column", "System"],
    ["setup", "Setup", "server", "System"],
  ];
  const counts = {};
  function renderNav() {
    const groups = [];
    for (const [id, label, ic, group] of PANES) {
      let g = groups.find((x) => x.label === group);
      if (!g) { g = { label: group, items: [] }; groups.push(g); }
      const b = el("button", { type: "button", className: id === pane ? "on" : "" }, el("span", { className: "side-ic" }, icon(ic)), el("span", { className: "side-label", textContent: label }), counts[id] != null ? el("em", { className: id === "reviews" && counts[id] ? "hot" : "", textContent: num(counts[id]) }) : null);
      b.title = label;
      if (counts[id] != null) b.setAttribute("aria-label", `${label}, ${num(counts[id])}`);
      if (id === pane) b.setAttribute("aria-current", "page");
      b.onclick = () => go(id);
      g.items.push(b);
    }
    $("side-nav").replaceChildren(
      ...groups.map((g) => el("div", { className: "side-group" }, el("p", { className: "side-group-label", textContent: g.label }), ...g.items))
    );
    const foot = $("side-foot");
    const items = setup.items || [];
    if (!items.length) { foot.hidden = true; applySideFilter(); return; }
    const missing = items.filter(([, ok]) => !ok).length;
    foot.hidden = false;
    foot.replaceChildren(
      el("span", { className: "side-foot-row", title: DESK.queueOpen ? "Stamping on" : "Stamping paused" }, el("span", { className: `dot ${DESK.queueOpen ? "ok" : "run"}` }), el("span", { textContent: DESK.queueOpen ? "Stamping on" : "Stamping paused" })),
      missing
        ? el("button", { type: "button", className: "side-foot-link", textContent: `${num(missing)} to connect`, onclick: () => go("setup") })
        : el("span", { className: "ad-muted", textContent: "All connected" })
    );
    applySideFilter();
  }
  const count = (id, n) => { counts[id] = n; renderNav(); };

  let pane = "overview";
  function go(name, fresh) {
    if (!PANES.some(([id]) => id === name)) name = "overview";
    pane = name;
    if (location.hash.slice(1) !== name) history.replaceState(null, "", `#${name}`);
    for (const [id] of PANES) $(`pane-${id}`).hidden = id !== name;
    renderNav();
    ({ overview: loadOverview, stamps: loadStamps, users: loadUsers, members: loadMembers, payments: loadPayments, reviews: loadReviews, analytics: loadAnalytics, setup: renderSetup })[name](fresh);
    scrollTo({ top: 0 });
  }
  addEventListener("hashchange", () => key && !$("app").hidden && location.hash.slice(1) !== pane && go(location.hash.slice(1)));
  document.querySelectorAll("[data-refresh]").forEach((b) => (b.onclick = () => go(b.dataset.refresh, true)));

  // Unlock

  const unlock = $("unlock");
  unlock.addEventListener("submit", (e) => {
    e.preventDefault();
    key = String(new FormData(unlock).get("key") || "");
    open();
  });
  $("lock").onclick = () => {
    key = "";
    session.set("");
    for (const k of Object.keys(cache)) delete cache[k];
    $("app").hidden = $("lock").hidden = $("queue").hidden = true;
    unlock.hidden = false;
    unlock.reset();
  };

  let setup = {};
  async function open() {
    const alert = unlock.querySelector("[role=alert]");
    alert.hidden = true;
    try {
      setup = (await call("session")).setup || {};
    } catch (err) {
      alert.hidden = false;
      alert.textContent = err.message === "Not available." ? "Admin is off: the admin key isn't set up yet." : err.message || "Could not open admin.";
      if (/key/i.test(String(err.message))) session.set("");
      return;
    }
    session.set(key);
    unlock.hidden = true;
    $("app").hidden = $("lock").hidden = $("queue").hidden = false;
    $("queue").textContent = DESK.queueOpen ? "Stamping on" : "Stamping paused";
    $("queue").className = `ad-pill ${DESK.queueOpen ? "ok" : "warn"}`;
    count("setup", (setup.items || []).filter(([, ok]) => !ok).length || null);
    go(location.hash.slice(1) || "overview");
    // Fill the sidebar counts in the background.
    getStamps(0).then((d) => count("stamps", d.total)).catch(() => {});
    getUsers().then((u) => count("users", u.length)).catch(() => {});
    getMembers().then((m) => count("members", (m.members || []).length)).catch(() => {});
    getReviews().then((r) => count("reviews", r.filter((x) => x.status !== "delivered").length)).catch(() => {});
  }

  // Drawer

  const drawer = $("drawer");
  let lastFocus = null;
  function openDrawer(title, kids) {
    lastFocus = document.activeElement;
    $("drawer-h").textContent = title;
    $("drawer-body").replaceChildren(...kids);
    drawer.hidden = false;
    document.body.classList.add("ad-locked");
    drawer.querySelector(".ad-sheet [data-close]").focus();
  }
  function closeDrawer() {
    drawer.hidden = true;
    document.body.classList.remove("ad-locked");
    lastFocus?.focus?.();
  }
  drawer.addEventListener("click", (e) => e.target.closest("[data-close]") && closeDrawer());
  addEventListener("keydown", (e) => e.key === "Escape" && !drawer.hidden && closeDrawer());

  // Overview

  async function loadOverview(fresh) {
    const body = $("ov-body");
    if (fresh || !body.dataset.ready) body.replaceChildren(el("p", { className: "ad-loading", textContent: "Loading…" }));
    const [st, us, mb, rv, an] = await Promise.allSettled([getStamps(0, fresh), getUsers(fresh), getMembers(fresh), getReviews(fresh), getAnalytics(30, fresh)]);
    const v = (p) => (p.status === "fulfilled" ? p.value : null);
    const stamps = v(st), users = v(us), members = v(mb)?.members, reviews = v(rv), data = v(an);
    const t = data?.traffic;
    if (stamps) count("stamps", stamps.total);
    if (users) count("users", users.length);
    if (members) count("members", members.length);
    const open = (reviews || []).filter((r) => r.status !== "delivered");
    if (reviews) count("reviews", open.length);

    const week = Date.now() - 7 * 86400e3;
    const ks = (members || []).filter((m) => m.killSheet?.active).length;
    const sa = (members || []).filter((m) => m.stayAlive?.active).length;
    const mrr = mrrOf(members || []);
    const latest = stamps?.stamps?.[0];

    const out = [
      kpis([
        ["Visitors", num(t?.totals.visitors), t ? `${num(t.totals.view)} page views` : "Analytics not connected"],
        ["Stamps", num(stamps?.total), latest ? `Latest ${latest.host}, ${ago(latest.createdAt)}` : "None yet"],
        ["Accounts", num(users?.length), users ? `${num(users.filter((u) => Date.parse(u.createdAt) > week).length)} new this week` : "Couldn't load"],
        ["Monthly revenue", members ? `$${nf.format(mrr)}` : "n/a", members ? `${plural(sa, "Stay Alive")} · ${plural(ks, "Kill Sheet")}` : "Couldn't load"],
      ]),
    ];

    const left = [];
    if (t?.daily?.length) left.push(panel("Visitors per day", "Last 30 days.", go2("analytics", "Analytics"), barChart(t.daily, "visitors", "Visitors")));
    left.push(
      panel(
        "Latest stamps",
        stamps ? `${plural(stamps.total, "stamp")} in all.` : "Couldn't load stamps.",
        go2("stamps", "All stamps"),
        table(stampCols(true), (stamps?.stamps || []).slice(0, 8), { onRow: (r) => openStamp(r), empty: "No stamps yet." })
      )
    );

    const right = [];
    const sample = stamps?.stamps || [];
    if (sample.length) right.push(panel("Verdict mix", `Across the latest ${plural(sample.length, "stamp")}.`, null, verdictMix(sample)));
    right.push(
      panel(
        "Review queue",
        open.length ? `${plural(open.length, "review")} waiting.` : "Nothing waiting.",
        go2("reviews", "Open"),
        open.length
          ? el("ul", { className: "status-list" }, open.slice(0, 5).map((r) => el("li", {}, el("span", { className: `dot ${r.status === "in_review" ? "run" : ""}` }), el("div", {}, el("b", { textContent: r.siteUrl || r.appUrl }), el("p", { textContent: `${LABEL[r.status]} · ${r.email}` })), muted(ago(r.createdAt)))))
          : el("p", { className: "ad-muted", textContent: "New requests from members show up here." })
      )
    );
    const missing = (setup.items || []).filter(([, ok]) => !ok);
    right.push(
      panel(
        "Setup",
        missing.length ? `${plural(missing.length, "thing")} to connect.` : "Everything is connected.",
        go2("setup", "Details"),
        el("ul", { className: "status-list" }, (missing.length ? missing : (setup.items || []).slice(0, 4)).map(([name, ok]) => el("li", {}, el("span", { className: `dot ${ok ? "ok" : "bad"}` }), el("b", { textContent: name }), muted(ok ? "Connected" : "Missing"))))
      )
    );

    out.push(el("div", { className: "grid2" }, el("div", { className: "ad-col" }, left), el("div", { className: "ad-col" }, right)));
    body.replaceChildren(...out);
    body.dataset.ready = "1";
  }
  const go2 = (id, label) => el("button", { type: "button", className: "btn btn-line btn-sm", textContent: label, onclick: () => go(id) });

  function verdictMix(rows) {
    const n = { DEAD: 0, COPE: 0, ALIVE: 0 };
    for (const r of rows) if (r.verdict in n) n[r.verdict]++;
    const total = rows.length || 1;
    const bar = el("div", { className: "ad-mix", role: "img", "aria-label": Object.entries(n).map(([k, c]) => `${k} ${c}`).join(", ") }, Object.entries(n).filter(([, c]) => c).map(([k, c]) => {
      const s = el("span", { className: `v-${k.toLowerCase()}` });
      s.style.width = `${(c / total) * 100}%`;
      return s;
    }));
    const legend = el("ul", { className: "ad-legend" }, Object.entries(n).map(([k, c]) => el("li", {}, el("i", { className: `v-${k.toLowerCase()}` }), el("span", { textContent: k[0] + k.slice(1).toLowerCase() }), el("b", { textContent: `${num(c)}` }), muted(`${Math.round((c / total) * 100)}%`))));
    return el("div", {}, bar, legend);
  }

  // Stamps

  let stPage = 0, stV = "";
  const lcp = (ms) => (ms ? el("span", { className: `ad-num ${ms > 2500 ? "bad" : ""}`, textContent: `${(ms / 1000).toFixed(1)}s` }) : muted("n/a"));
  function stampCols(short) {
    const cols = [
      { label: "Site", cell: (r) => site(r.host, r.icon, `#${String(r.number || 0).padStart(4, "0")}`) },
      { label: "Verdict", cell: (r) => vchip(r.verdict) },
      { label: "Score", cls: "num", cell: (r) => el("span", { className: "ad-num", textContent: r.score ?? "n/a" }) },
    ];
    if (!short) {
      cols.push(
        { label: "Failed", cls: "num hide-sm", cell: (r) => el("span", { className: "ad-num", title: r.failed.join(", "), textContent: r.failed.length }) },
        { label: "Main content", cls: "num hide-sm", cell: (r) => lcp(r.lcp) },
        { label: "Saved by", cls: "hide-md", cell: (r) => (r.owner ? el("span", { className: "ad-ell", textContent: r.owner }) : muted("Not saved")) }
      );
    }
    cols.push({ label: "Stamped", cls: "num hide-sm", cell: (r) => muted(ago(r.createdAt)) });
    return cols;
  }
  $("st-prev").append(icon("chevron-left"));
  $("st-next").append(icon("chevron-right"));
  $("st-prev").onclick = () => stPage > 0 && (stPage--, loadStamps());
  $("st-next").onclick = () => (stPage++, loadStamps());
  $("st-q").oninput = () => renderStamps();
  $("st-v").querySelectorAll("button").forEach((b) => (b.onclick = () => {
    stV = b.dataset.v;
    $("st-v").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderStamps();
  }));
  let stData = null;
  async function loadStamps(fresh) {
    fail("st-alert");
    try {
      stData = await getStamps(stPage, fresh);
    } catch (err) {
      return fail("st-alert", err);
    }
    stPage = stData.page;
    count("stamps", stData.total);
    $("st-sub").textContent = `${plural(stData.total, "published stamp")}, newest first. Open one for its checks, stack, speed, SEO, and security.`;
    $("st-page").textContent = `Page ${stData.page + 1} of ${stData.pages || 1}`;
    $("st-prev").disabled = stData.page <= 0;
    $("st-next").disabled = stData.page >= (stData.pages || 1) - 1;
    renderStamps();
  }
  function renderStamps() {
    if (!stData) return;
    const q = $("st-q").value.trim().toLowerCase();
    const rows = stData.stamps.filter((r) => (!stV || r.verdict === stV) && (!q || `${r.host} ${r.owner} ${r.pageUrl}`.toLowerCase().includes(q)));
    $("stamps").replaceChildren(table(stampCols(false), rows, { onRow: openStamp, empty: q || stV ? "No stamps on this page match." : "No stamps yet." }));
  }

  async function openStamp(row) {
    openDrawer(row.host, [el("p", { className: "ad-loading", textContent: "Loading…" })]);
    try {
      const { stamp: r } = await call(`stamp&id=${encodeURIComponent(row.id)}`);
      if (!drawer.hidden && $("drawer-h").textContent === row.host) $("drawer-body").replaceChildren(...stampDetail(r, row));
    } catch (err) {
      $("drawer-body").replaceChildren(el("p", { className: "alert", textContent: err.message }));
    }
  }
  const tiles = (items) => el("dl", { className: "scout" }, items.filter(Boolean).map(([k, v, tone]) => el("div", {}, el("dt", { textContent: k }), el("dd", { className: tone || "", textContent: v }))));
  const sec = (ms) => (ms == null ? "n/a" : `${(ms / 1000).toFixed(2)}s`);
  function stampDetail(r, row) {
    const out = [];
    const checks = (r.checks || []).filter((k) => !k.skip);
    const passed = checks.filter((k) => k.pass).length;
    out.push(
      el("div", { className: "ad-verdict" }, vchip(r.verdict), el("b", { className: "ad-num", textContent: `${r.score ?? "n/a"}/100` }), muted(`#${String(r.number || 0).padStart(4, "0")} · ${stamp(r.createdAt)}`)),
      r.sentence ? el("p", { className: "ad-quote", textContent: `“${r.sentence}”` }) : null,
      r.image ? el("a", { className: "ad-shot", href: r.image, target: "_blank", rel: "noopener noreferrer" }, el("img", { src: r.image, alt: `First screen of ${r.host}` })) : null,
      el("div", { className: "row-actions" },
        el("a", { className: "btn btn-dark btn-sm", href: `/v/${r.id}`, target: "_blank", rel: "noopener", textContent: "Open stamp" }),
        el("a", { className: "btn btn-line btn-sm", href: r.pageUrl, target: "_blank", rel: "noopener noreferrer", textContent: "Open page" }),
        r.card ? el("a", { className: "btn btn-line btn-sm", href: `/api/card?id=${encodeURIComponent(r.id)}`, target: "_blank", rel: "noopener", textContent: "Share card" }) : null
      ),
      el("dl", { className: "kv" },
        el("div", {}, el("dt", { textContent: "Page" }), el("dd", { className: "ad-break", textContent: r.pageUrl })),
        el("div", {}, el("dt", { textContent: "Saved by" }), el("dd", { textContent: row.owner || "Not saved to an account" })),
        el("div", {}, el("dt", { textContent: "Checks" }), el("dd", { textContent: `${passed} of ${checks.length} passed` }))
      )
    );
    out.push(el("h3", { textContent: "Checks" }), el("ul", { className: "ad-checks" }, checks.map((k) => el("li", { className: k.pass ? "pass" : "fail" }, icon(k.pass ? "check" : "x"), el("div", {}, el("b", { textContent: k.label }), el("p", { textContent: k.detail }), !k.pass && k.fix ? el("p", { className: "ad-fix", textContent: `Fix: ${k.fix}` }) : null)))));
    const s = r.snapshot || {};
    if (s.stack?.length) out.push(el("h3", { textContent: `Stack · ${s.stack.length}` }), table([{ label: "Tool", cell: (t) => el("b", { textContent: t.name }) }, { label: "Kind", cell: (t) => muted(t.category) }, { label: "Found by", cell: (t) => el("span", { className: "ad-small", textContent: t.evidence }) }], s.stack));
    const b = s.browser;
    if (b) {
      const kb = b.kb ? Object.values(b.kb).reduce((a, x) => a + (x || 0), 0) : null;
      out.push(el("h3", { textContent: "Speed" }), tiles([["Main content", sec(b.lcp), b.lcp > 2500 ? "bad" : "ok"], ["Server answered", sec(b.ttfb)], ["Layout shift", b.cls ?? "n/a", b.cls > 0.1 ? "bad" : ""], ["Fully loaded", sec(b.load)], ["Requests", num(b.requests)], kb != null && ["Page weight", kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`], b.thirdParty && ["Other domains", num(b.thirdParty.length)]]));
    }
    if (s.seo) out.push(el("h3", { textContent: "SEO" }), tiles([["Search engines", s.seo.noindex ? "Blocked" : "Allowed", s.seo.noindex ? "bad" : "ok"], ["Headlines (h1)", num(s.seo.h1Count), s.seo.h1Count === 1 ? "" : "bad"], ["Title", `${s.seo.titleLength} chars`], ["Description", `${s.seo.descriptionLength} chars`], ["Canonical", s.seo.canonical ? "Set" : "Missing", s.seo.canonical ? "" : "bad"], ["Images without alt", `${s.seo.imagesWithoutAlt} of ${s.seo.images}`, s.seo.imagesWithoutAlt ? "bad" : ""], s.seo.lang != null && ["Language", s.seo.lang || "Not set"]]));
    if (s.security) {
      const names = { hsts: "HSTS", csp: "Content policy", frameOptions: "Frame options", noSniff: "No sniff", referrerPolicy: "Referrer policy" };
      out.push(el("h3", { textContent: "Security headers" }), tiles(Object.entries(s.security).map(([k, v]) => [names[k] || k, v ? "Yes" : "No", v ? "ok" : "bad"])));
    }
    return out;
  }

  // Accounts

  let usF = "";
  $("us-q").oninput = () => renderUsers();
  $("us-f").querySelectorAll("button").forEach((b) => (b.onclick = () => {
    usF = b.dataset.f;
    $("us-f").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderUsers();
  }));
  let users = [];
  async function loadUsers(fresh) {
    fail("us-alert");
    try {
      users = await getUsers(fresh);
    } catch (err) {
      return fail("us-alert", err);
    }
    count("users", users.length);
    const paid = users.filter((u) => u.killSheet || u.stayAlive).length;
    $("us-sub").textContent = `${plural(users.length, "account")}, ${num(paid)} paying. Newest first.`;
    renderUsers();
  }
  const plans = (u) => [u.killSheet && chip("Kill Sheet", "ink"), u.stayAlive && chip("Stay Alive", "ok"), !u.killSheet && !u.stayAlive && chip("Free")];
  function renderUsers() {
    const q = $("us-q").value.trim().toLowerCase();
    const rows = users.filter((u) => (!usF || (usF === "paid") === !!(u.killSheet || u.stayAlive)) && (!q || `${u.email} ${u.x}`.toLowerCase().includes(q)));
    $("users").replaceChildren(
      table(
        [
          { label: "Account", cell: (u) => person(u.email, u.x ? `@${u.x}` : "") },
          { label: "Plan", cell: (u) => el("span", { className: "ad-chips" }, plans(u)) },
          { label: "Sign-in", cls: "hide-sm", cell: (u) => muted(u.x ? "X" : u.password ? "Password" : "Email") },
          { label: "Stamps", cls: "num", cell: (u) => el("span", { className: "ad-num", textContent: u.stamps }) },
          { label: "Reviews", cls: "num hide-sm", cell: (u) => el("span", { className: "ad-num", textContent: u.reviews }) },
          { label: "Last stamp", cls: "hide-md", cell: (u) => (u.lastStamp ? el("span", { className: "ad-ell", textContent: u.lastStamp }) : muted("None")) },
          { label: "Joined", cls: "num", cell: (u) => muted(ago(u.createdAt)) },
        ],
        rows,
        { empty: q || usF ? "No accounts match." : "No accounts yet." }
      )
    );
  }

  // Members

  async function loadMembers(fresh) {
    fail("mb-alert");
    let data;
    try {
      data = await getMembers(fresh);
    } catch (err) {
      return fail("mb-alert", err);
    }
    const ms = data.members || [];
    count("members", ms.length);
    const ks = ms.filter((m) => m.killSheet?.active).length;
    const sa = ms.filter((m) => m.stayAlive?.active).length;
    const leaving = ms.filter((m) => m.stayAlive?.cancelAtPeriodEnd).length;
    $("mb-sub").textContent = `${plural(ms.length, "member")} of ${plural(data.accounts || 0, "account")}.`;
    $("members").replaceChildren(
      kpis([
        ["Members", num(ms.length), `${pct(ms.length, data.accounts)} of accounts`],
        ["Kill Sheets", num(ks), `$${nf.format(ks * KILL_SHEET)} one-time`],
        ["Stay Alive", num(sa), `${num(leaving)} cancelling`],
        ["Monthly revenue", `$${nf.format(mrrOf(ms))}`, `${num(ms.filter((m) => m.stayAlive?.active && m.stayAlive.interval === "year").length)} billed yearly`],
      ]),
      table(
        [
          { label: "Member", cell: (m) => person(m.email, `Joined ${date(m.createdAt)}`) },
          { label: "Kill Sheet", cell: (m) => (m.killSheet ? el("span", { className: "ad-stack" }, chip(m.killSheet.active ? "Active" : "Refunded", m.killSheet.active ? "ink" : "bad"), muted(`since ${date(m.killSheet.since)}`)) : muted("None")) },
          { label: "Stay Alive", cell: (m) => (m.stayAlive ? el("span", { className: "ad-stack" }, chip(m.stayAlive.cancelAtPeriodEnd ? "Cancelling" : m.stayAlive.status, m.stayAlive.active && !m.stayAlive.cancelAtPeriodEnd ? "ok" : "warn"), muted(`${(m.stayAlive.seats || 1) > 1 ? `${m.stayAlive.seats} sites, ` : ""}${m.stayAlive.interval === "year" ? "yearly, " : ""}${m.stayAlive.cancelAtPeriodEnd ? "ends" : "renews"} ${date(m.stayAlive.renews)}`)) : muted("None")) },
          { label: "Page", cls: "hide-md", cell: (m) => { const u = m.stayAlive?.url || m.killSheet?.url; return u ? el("a", { className: "ad-ell", href: u, target: "_blank", rel: "noopener noreferrer", textContent: u.replace(/^https?:\/\//, "") }) : muted("No page yet"); } },
          { label: "Stamps", cls: "num hide-sm", cell: (m) => el("span", { className: "ad-num", textContent: m.stamps }) },
          { label: "", cls: "num", cell: (m) => (m.killSheet?.url ? rescout(m) : "") },
        ],
        ms,
        { empty: `No members yet. ${plural(data.accounts || 0, "free account")}.` }
      )
    );
  }
  const pct = (a, b) => (!b ? "n/a" : `${Math.round((a / b) * 100)}%`);
  function rescout(m) {
    const b = el("button", { type: "button", className: "btn btn-line btn-sm", title: "Run the Kill Sheet on their page again", textContent: "Rerun" });
    b.prepend(icon("rotate-ccw"));
    b.onclick = async () => {
      b.disabled = true;
      try {
        await call("rescout", { email: m.email });
        b.replaceChildren(icon("check"), "Started");
      } catch (err) {
        b.disabled = false;
        b.title = err.message;
        b.replaceChildren(icon("circle-alert"), "Failed");
      }
    };
    return b;
  }

  // Payments

  const getPayments = (fresh) => get("payments", () => call("payments"), fresh);
  async function loadPayments(fresh) {
    fail("pay-alert");
    let data;
    try {
      data = await getPayments(fresh);
    } catch (err) {
      return fail("pay-alert", err);
    }
    const rows = data.rows || [];
    const off = rows.filter((r) => !r.on && ["active", "trialing", "paid"].includes(r.status));
    count("payments", off.length || null);
    $("payments").replaceChildren(
      ...[data.ready ? null : el("p", { className: "note", textContent: "The payment API token isn't set, so payments can't be listed. Payment messages still show below." }),
      off.length ? el("p", { className: "alert", textContent: `${plural(off.length, "payment")} without the plan on. Press Sync on ${off.length === 1 ? "it" : "each"}.` }) : null,
      table(
        [
          { label: "Account", cell: (r) => person(r.account || r.payer || "Unknown", r.account && r.payer && r.payer !== r.account ? `paid as ${r.payer}` : r.account ? "" : "no matching account") },
          { label: "Plan", cell: (r) => el("span", { className: "ad-stack" }, chip(r.plan === "killSheet" ? "Kill Sheet" : "Stay Alive", "ink"), muted([r.yearly ? "yearly" : r.kind === "subscription" ? "monthly" : "one-time", r.seats > 1 ? `${r.seats} sites` : ""].filter(Boolean).join(", "))) },
          { label: "Payment", cell: (r) => chip(r.status, ["active", "trialing", "paid"].includes(r.status) ? "ok" : r.status === "past_due" ? "warn" : "") },
          { label: "On the account", cell: (r) => (r.on ? chip("Yes", "ok") : chip("No", ["active", "trialing", "paid"].includes(r.status) ? "bad" : "")) },
          { label: "When", cls: "num hide-sm", cell: (r) => muted(ago(r.at)) },
          { label: "", cls: "num", cell: (r) => (r.account ? syncButton(r.account) : "") },
        ],
        rows,
        { empty: "No payments yet." }
      ),
      ].filter(Boolean)
    );
    const log = data.log || [];
    $("pay-log").replaceChildren(
      table(
        [
          { label: "When", cell: (e) => muted(stamp(e.at)) },
          { label: "Message", cell: (e) => el("span", { className: "ad-num", textContent: e.type || "" }) },
          { label: "Result", cell: (e) => chip(e.action || "", e.error || e.action === "Bad signature" || e.action === "no account" ? "bad" : e.action === "ignored" ? "" : "ok") },
          { label: "Account", cell: (e) => (e.error ? el("span", { className: "ad-small", textContent: e.error }) : muted(e.email || "")) },
        ],
        log,
        { empty: "No payment messages recorded yet. New ones show here as they arrive." }
      )
    );
  }
  function syncButton(email) {
    const b = el("button", { type: "button", className: "btn btn-line btn-sm", textContent: "Sync" });
    b.onclick = async () => {
      b.disabled = true;
      b.textContent = "Syncing…";
      try {
        const { result } = await call("sync", { email });
        b.textContent = result.checked ? (result.stayAlive || result.killSheet ? "Synced" : "Up to date") : result.reason;
        setTimeout(() => go("payments", true), 900);
      } catch (err) {
        b.disabled = false;
        b.textContent = "Failed";
        b.title = err.message;
      }
    };
    return b;
  }

  // Reviews

  const LABEL = { received: "Received", in_review: "In review", delivered: "Delivered" };
  const ORDER = ["received", "in_review", "delivered"];
  let reviews = [];
  let view = "open";
  $("rv-v").querySelectorAll("button").forEach((b) => (b.onclick = () => {
    view = b.dataset.view;
    $("rv-v").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderReviews();
  }));
  async function loadReviews(fresh) {
    fail("rv-alert");
    try {
      reviews = await getReviews(fresh);
    } catch (err) {
      return fail("rv-alert", err);
    }
    renderReviews();
  }
  const lines = (v) => (Array.isArray(v) ? v.filter(Boolean).join("\n") : "");
  function renderReviews() {
    count("reviews", reviews.filter((r) => r.status !== "delivered").length);
    const shown = reviews.filter((r) => view === "all" || (view === "open" ? r.status !== "delivered" : r.status === "delivered"));
    $("reviews").replaceChildren(shown.length ? el("div", { className: "ad-reviews" }, shown.map(reviewCard)) : el("p", { className: "empty", textContent: view === "open" ? "No open reviews. New requests from members show up here." : "Nothing here yet." }));
  }
  function reviewCard(r) {
    const out = el("p", { className: "alert", hidden: true });
    const loginBox = el("div", { className: "login-box", hidden: true });
    const field = (label, rows, placeholder, value) => {
      const t = el("textarea", { rows, placeholder, value });
      return [el("label", {}, label, t), t];
    };
    const [fSum, summary] = field("Summary", 3, "What a new user experiences, in two or three sentences.", r.result?.summary || "");
    const [fProb, problems] = field("Problems", 4, "One per line.", lines(r.result?.problems));
    const [fFix, fixes] = field("Fixes, ranked", 4, "One per line.", lines(r.result?.fixes));
    const [fCopy, copy] = field("Rewritten copy", 4, "Headline, subhead, buttons, onboarding text.", r.result?.copy || "");
    const result = () => ({ summary: summary.value, problems: problems.value.split("\n"), fixes: fixes.value.split("\n"), copy: copy.value });

    async function move(status, btn) {
      out.hidden = true;
      if (btn) btn.disabled = true;
      try {
        const { review } = await call("review", { email: r.email, id: r.id, status, result: result() });
        Object.assign(r, review);
        renderReviews();
      } catch (err) {
        out.hidden = false;
        out.textContent = err.message;
        if (btn) btn.disabled = false;
      }
    }
    async function showLogin() {
      out.hidden = true;
      try {
        const { login } = await call("login", { email: r.email, id: r.id });
        loginBox.hidden = false;
        loginBox.replaceChildren(el("dl", { className: "kv" }, el("div", {}, el("dt", { textContent: "Email" }), el("dd", { className: "ad-num", textContent: login.email })), el("div", {}, el("dt", { textContent: "Password" }), el("dd", { className: "ad-num", textContent: login.password }))), el("p", { className: "warn-line", textContent: "A throwaway test account. Use it only for this review. It's deleted when you deliver." }));
      } catch (err) {
        out.hidden = false;
        out.textContent = err.message;
      }
    }

    const at = ORDER.indexOf(r.status);
    const steps = el("ol", { className: "steps" }, ORDER.map((s, i) => el("li", { className: i < at ? "done" : i === at ? "now" : "", textContent: LABEL[s] })));
    const actions = el("div", { className: "row-actions" });
    if (r.status === "received") actions.append(el("button", { type: "button", className: "btn btn-dark btn-sm", textContent: "Start review", onclick: (e) => move("in_review", e.currentTarget) }));
    if (r.status === "in_review") {
      if (r.login === "stored") actions.append(el("button", { type: "button", className: "btn btn-line btn-sm", textContent: "Show test login", onclick: showLogin }));
      actions.append(el("button", { type: "button", className: "btn btn-line btn-sm", textContent: "Save draft", onclick: (e) => move("in_review", e.currentTarget) }));
      actions.append(el("button", { type: "button", className: "btn btn-dark btn-sm", textContent: "Deliver to dashboard", onclick: (e) => move("delivered", e.currentTarget) }));
    }
    const form = r.status === "received" ? null : el("div", { className: "review-form" }, fSum, el("div", { className: "row2" }, fProb, fFix), fCopy);
    return el(
      "article",
      { className: "panel ad-review" },
      el("header", { className: "panel-head" },
        el("div", {}, el("h2", {}, el("span", { className: "ad-break", textContent: r.siteUrl || r.appUrl })), el("p", { textContent: `${r.plan === "killSheet" ? "Kill Sheet" : "Stay Alive"} · ${r.email} · sent ${ago(r.createdAt)}` })),
        chip(LABEL[r.status], r.status === "delivered" ? "ok" : r.status === "in_review" ? "warn" : "")
      ),
      steps,
      el("dl", { className: "kv ad-kv" },
        r.appUrl && r.siteUrl ? el("div", {}, el("dt", { textContent: "App" }), el("dd", { className: "ad-break", textContent: r.appUrl })) : null,
        el("div", {}, el("dt", { textContent: "Test login" }), el("dd", { textContent: { stored: "Stored, encrypted", revoked: "Revoked by the member", deleted: "Deleted" }[r.login] || r.login || "None" })),
        r.what ? el("div", {}, el("dt", { textContent: "Look at" }), el("dd", { textContent: r.what })) : null
      ),
      loginBox,
      form,
      actions,
      out
    );
  }

  // Analytics

  let days = 30;
  $("an-range").querySelectorAll("button").forEach((b) => (b.onclick = () => {
    days = Number(b.dataset.days);
    $("an-range").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    loadAnalytics();
  }));
  async function loadAnalytics(fresh) {
    const body = $("an-body");
    body.classList.add("loading");
    try {
      const data = await getAnalytics(days, fresh);
      $("an-notes").replaceChildren(...(data.notes || []).map((n) => el("li", { textContent: n })));
      renderAnalytics(body, data);
    } catch (err) {
      body.replaceChildren(el("p", { className: "alert", textContent: err.message || "Could not load analytics." }));
    } finally {
      body.classList.remove("loading");
    }
  }

  // Setup. The checklist text comes from the server, so the public script names no services.

  function renderSetup() {
    const items = setup.items || [];
    const ok = items.filter(([, x]) => x).length;
    $("setup-sum").textContent = `${ok} of ${items.length} connected.`;
    $("setup-list").replaceChildren(...items.map(([name, on, text]) => el("li", {}, el("span", { className: `dot ${on ? "ok" : "bad"}` }), el("div", {}, el("b", { textContent: name }), el("p", { textContent: text })), chip(on ? "Connected" : "Missing", on ? "ok" : "warn"))));
    $("queue-note").textContent = DESK.queueOpen
      ? "On. To pause it, set queueOpen to false in src/config.js and deploy."
      : "Paused. To turn it on, set queueOpen to true in src/config.js and deploy.";
  }

  $("recards").onclick = async () => {
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
  };

  renderNav();
  if (key) open();
})();
