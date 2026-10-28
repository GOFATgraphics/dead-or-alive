// The desk's Analytics tab. Summary first, then the funnel, daily charts, verdicts, and tables.
// All labels go in with textContent; nothing from the data is parsed as HTML.

const ERROR_LABELS = {
  empty: "Left the URL empty",
  spaces: "URL had spaces",
  email_as_url: "Typed an email as the URL",
  scheme: "Not an https:// address",
  unparseable: "Not a URL",
  credentials: "Name and password in the URL",
  port: "URL had a port number",
  ip: "IP address instead of a domain",
  not_public: "Not a public address",
  email: "Email didn't look right",
  limit: "Hit the daily stamp limit",
  other: "Other",
};
const VERDICTS = ["DEAD", "COPE", "ALIVE"];

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const nf = new Intl.NumberFormat();
const num = (v) => (v == null ? "n/a" : nf.format(v));
const pct = (a, b) => (!b || a == null ? "n/a" : `${Math.round((a / b) * 100)}%`);
const money = (cents, cur) => (cents == null ? "n/a" : new Intl.NumberFormat(undefined, { style: "currency", currency: cur || "USD" }).format(cents / 100));
const shortDay = (d) => new Date(d + "T12:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" });

function section(title, hint) {
  const s = el("section", "an-card");
  const h = el("div", "an-card-head");
  h.append(el("h3", "", title));
  if (hint) h.append(el("p", "an-hint", hint));
  s.append(h);
  return s;
}

function tile(label, value, sub) {
  const t = el("div", "an-tile");
  t.append(el("p", "an-tile-label", label), el("p", "an-tile-value", value));
  if (sub) t.append(el("p", "an-tile-sub", sub));
  return t;
}

// One tooltip for every chart on the tab.
let tip;
function tooltip() {
  if (!tip) {
    tip = el("div", "an-tip");
    tip.setAttribute("role", "status");
    tip.hidden = true;
    document.body.append(tip);
  }
  return tip;
}
function showTip(target, value, label) {
  const t = tooltip();
  t.replaceChildren(el("strong", "", value), el("span", "", label));
  t.hidden = false;
  const r = target.getBoundingClientRect();
  const w = t.offsetWidth;
  t.style.left = `${Math.min(innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2))}px`;
  t.style.top = `${r.top + scrollY - t.offsetHeight - 8}px`;
}
const hideTip = () => tip && (tip.hidden = true);

// Daily bars: one series, one axis. Bars round at the top only, 2px gaps, values on hover and focus.
export function barChart(rows, key, label, format = num) {
  const wrap = el("div", "an-chart");
  const max = Math.max(1, ...rows.map((r) => r[key] || 0));
  const W = 600, H = 160, pad = 2;
  const bw = W / rows.length;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H + 1}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${label} per day. Highest: ${format(max)}.`);
  for (const y of [0.5, 1]) {
    const g = document.createElementNS(ns, "line");
    g.setAttribute("x1", 0); g.setAttribute("x2", W);
    g.setAttribute("y1", H - y * H); g.setAttribute("y2", H - y * H);
    g.setAttribute("class", "an-grid");
    svg.append(g);
  }
  rows.forEach((r, i) => {
    const v = r[key] || 0;
    const h = v ? Math.max(3, (v / max) * (H - 4)) : 0;
    const x = i * bw + pad / 2, w = Math.max(1, bw - pad), y = H - h, rad = Math.min(4, w / 2, h);
    if (h) {
      const p = document.createElementNS(ns, "path");
      p.setAttribute("d", `M${x},${H} V${y + rad} Q${x},${y} ${x + rad},${y} H${x + w - rad} Q${x + w},${y} ${x + w},${y + rad} V${H} Z`);
      p.setAttribute("class", "an-bar");
      svg.append(p);
    }
    const hit = document.createElementNS(ns, "rect");
    hit.setAttribute("x", i * bw); hit.setAttribute("y", 0);
    hit.setAttribute("width", bw); hit.setAttribute("height", H);
    hit.setAttribute("class", "an-hit");
    hit.setAttribute("tabindex", "0");
    hit.setAttribute("aria-label", `${shortDay(r.day)}: ${format(v)}`);
    const on = () => showTip(hit, format(v), `${label}, ${shortDay(r.day)}`);
    hit.addEventListener("pointerenter", on);
    hit.addEventListener("focus", on);
    hit.addEventListener("pointerleave", hideTip);
    hit.addEventListener("blur", hideTip);
    svg.append(hit);
  });
  const axis = el("div", "an-axis");
  axis.append(el("span", "", shortDay(rows[0].day)), el("span", "", `Max ${format(max)}`), el("span", "", shortDay(rows[rows.length - 1].day)));
  wrap.append(svg, axis);
  return wrap;
}

// Funnel: each step's bar is its share of the first step; the step-to-step rate sits beside it.
function funnel(steps) {
  const list = el("ol", "an-funnel");
  const first = steps.find((s) => s.value != null)?.value || 0;
  steps.forEach((s, i) => {
    const li = el("li");
    const prev = steps.slice(0, i).reverse().find((p) => p.value != null);
    const head = el("div", "an-funnel-head");
    head.append(el("span", "an-funnel-label", s.label), el("strong", "", num(s.value)));
    const bar = el("div", "an-funnel-track");
    const fill = el("span", "an-funnel-fill");
    fill.style.width = !s.value || !first ? "0%" : `${Math.max(1.5, Math.min(100, (s.value / first) * 100))}%`;
    bar.append(fill);
    li.append(head, bar);
    li.append(el("p", "an-funnel-rate", s.value == null ? s.missing || "Not connected" : i && prev ? `${pct(s.value, prev.value)} of the step before` : "Starting point"));
    list.append(li);
  });
  return list;
}

function table(headers, rows, empty) {
  if (!rows.length) return el("p", "an-empty", empty);
  const t = el("table", "an-table");
  const thead = el("thead");
  const tr = el("tr");
  headers.forEach((h, i) => tr.append(el("th", i ? "num" : "", h)));
  thead.append(tr);
  const tb = el("tbody");
  for (const r of rows) {
    const row = el("tr");
    r.forEach((c, i) => row.append(el("td", i ? "num" : "", c)));
    tb.append(row);
  }
  t.append(thead, tb);
  return t;
}


// Traffic channels: a bar per channel, sized by its share of all recorded referrer visits.
function channelBars(channels) {
  if (!channels.length) return el("p", "an-empty", "No referrer data yet.");
  const list = el("div", "an-channels");
  for (const c of channels) {
    const row = el("div", "an-channel");
    const head = el("div", "an-channel-head");
    head.append(el("span", "an-channel-label", c.channel), el("strong", "", `${num(c.visits)} · ${c.share}%`));
    const track = el("div", "an-channel-track");
    const fill = el("span", "an-channel-fill");
    fill.style.width = `${Math.max(1.5, Math.min(100, c.share))}%`;
    track.append(fill);
    row.append(head, track);
    list.append(row);
  }
  return list;
}

export function renderAnalytics(root, data) {
  const t = data.traffic;
  const b = data.business;
  const cur = b?.currency;
  const out = [];

  // Summary
  const tiles = el("div", "an-tiles");
  tiles.append(
    tile("Visitors", num(t?.totals.visitors), t ? `${num(t.totals.view)} page views` : "Not connected"),
    tile("Stamps started", num(t?.totals.stamp_start), t ? `${pct(t.totals.stamp_start, t.totals.homeVisitors)} of homepage visitors` : "Not connected"),
    tile("Stamped", num(b?.totals.stamped), b ? `${pct(b.totals.stamped, t?.totals.stamp_start)} of stamps started` : "Not connected"),
    tile("Monthly revenue", money(b?.members.mrr, cur), b ? `${num(b.members.stayAlive)} Stay Alive members${b.members.extraSites ? `, ${num(b.members.extraSites)} extra sites` : ""}` : "Not connected"),
    tile("Result page views", num(t?.totals["view:result"]), t ? `${num(t.totals.share_copy)} shares` : "Not connected"),
    tile("Offer clicks", num(t?.totals.offer_click), t ? `${pct(t.totals.offer_click, t.totals["view:result"])} of result views · Kill Sheet or Stay Alive` : "Not connected"),
    tile("New accounts", num(t?.totals.signup), t ? `${num(t.totals.login)} sign-ins · ${num(t.totals.save_click)} unlock or save clicks` : "Not connected"),
    tile("Sent to checkout", num(t?.totals.checkout_start), t ? `${num(t.totals.review_submit)} app reviews sent · ${num(t.totals["view:pricing"])} pricing views` : "Not connected")
  );
  out.push(tiles);

  // Where visitors come from: channels first (Search, Social, Referral, Campaign, Direct),
  // then the exact sites and links behind them, with each source's share.
  if (t) {
    const ts = section("Where visitors come from", "To the homepage. Direct means no referrer was recorded: typed URL, bookmark, app, or a browser that strips referrers. Direct is counted from this update onward, so older ranges understate it.");
    ts.append(channelBars(t.channels || []));
    if (t.referrers.length) ts.append(el("p", "an-hint", `Top source: ${t.referrers[0].name} (${num(t.referrers[0].count)} visits).`));
    ts.append(table(["Source", "Visits", "Share"], t.referrers.map((r) => [r.name, num(r.count), pct(r.count, t.referrerTotal)]), "No outside sites yet."));
    out.push(ts);
    const rs = section("Where stamps get opened", "Sites people came from when opening a result page: where stamps are being posted.");
    rs.append(channelBars(t.resultChannels || []));
    rs.append(table(["Source", "Opens", "Share"], t.resultReferrers.map((r) => [r.name, num(r.count), pct(r.count, t.resultReferrerTotal)]), "No outside sites yet."));
    out.push(rs);
  }

  // Funnel
  const f = section("Funnel", "Visitors are counted once per day. Stamped counts published stamps.");
  f.append(
    funnel([
      { label: "Homepage visitors", value: t?.totals.homeVisitors },
      { label: "Clicked into the form", value: t?.totals.form_start },
      { label: "Pressed “Judge my page”", value: t?.totals.submit_try },
      { label: "Stamps started", value: t?.totals.stamp_start },
      { label: "Stamped", value: b?.totals.stamped, missing: "Not connected" },
      { label: "Result page views", value: t?.totals["view:result"] },
      { label: "Clicked unlock or save", value: t?.totals.save_click },
      { label: "Created an account", value: t?.totals.signup },
      { label: "Clicked an offer", value: t?.totals.offer_click },
      { label: "Went to checkout", value: t?.totals.checkout_start },
      { label: "Shares (link, X, LinkedIn, card)", value: t?.totals.share_copy },
    ])
  );
  out.push(f);

  // Daily charts: separate charts, never two scales on one.
  const charts = el("div", "an-grid2");
  if (t) {
    const c = section("Visitors per day");
    c.append(barChart(t.daily, "visitors", "Visitors"));
    charts.append(c);
  }
  if (b) {
    const c = section("Paid orders per day");
    c.append(barChart(b.daily, "orders", "Paid orders"));
    charts.append(c);
    const r = section("Revenue per day");
    r.append(barChart(b.daily, "revenue", "Revenue", (v) => money(v, cur)));
    charts.append(r);
  }
  if (t) {
    const c = section("Stamps started per day");
    c.append(barChart(t.daily, "checkouts", "Stamps started"));
    charts.append(c);
  }
  if (charts.childElementCount) out.push(charts);

  // Verdicts: each verdict has its own labeled row, so color is never the only cue.
  const v = section("Verdicts", "Stamped counts stamps published in this range. Views and copied links count result pages opened in this range.");
  const vrows = VERDICTS.map((name) => {
    const stamped = b?.verdicts[name];
    return [name, num(stamped), b ? pct(stamped, b.totals.stamped) : "n/a", num(t?.verdictViews[name]), num(t?.verdictShares[name])];
  });
  const vt = table(["Verdict", "Stamped", "Share", "Result views", "Links copied"], vrows, "");
  vt.querySelectorAll("tbody tr td:first-child").forEach((td) => {
    const name = td.textContent;
    td.replaceChildren(el("span", `word ${name.toLowerCase()}`, name));
  });
  v.append(vt);
  out.push(v);

  // Plans and money
  const two = el("div", "an-grid2");
  const ta = section("Plans", "Sales in this range; members and monthly revenue as of now.");
  ta.append(
    table(
      ["Measure", "Value"],
      [
        ["Kill Sheets sold", num(b?.totals.killSheets)],
        ["Stay Alive payments, renewals included", num(b?.totals.stayAlivePayments)],
        ["Stay Alive members now", b ? `${num(b.members.stayAlive)}${b.members.yearly ? ` (${num(b.members.yearly)} yearly)` : ""}` : "n/a"],
        ["Extra sites", num(b?.members.extraSites)],
        ["Monthly recurring revenue", money(b?.members.mrr, cur)],
      ],
      ""
    )
  );
  const mo = section("Money");
  mo.append(
    table(
      ["Measure", "Value"],
      [
        ["Revenue, after refunds", money(b?.totals.revenue, cur)],
        ["Paid orders", num(b?.totals.orders)],
        ["Average order", money(b?.totals.averageOrder, cur)],
        ["Refunds", b ? `${num(b.totals.refunds)} (${money(b.totals.refunded, cur)})` : "n/a"],
      ],
      ""
    )
  );
  two.append(ta, mo);
  out.push(two);

  // Where people come from, and what trips them up
  if (t) {
    const grid = el("div", "an-grid2");
    const countries = section("Countries");
    let regionName;
    try {
      regionName = new Intl.DisplayNames(undefined, { type: "region" });
    } catch (_) {}
    countries.append(table(["Country", "Page views"], t.countries.map((r) => [regionName?.of(r.name) || r.name, num(r.count)]), "No data yet."));
    const devices = section("Devices");
    const totalDev = t.devices.reduce((a, d) => a + d.count, 0);
    devices.append(table(["Device", "Page views", "Share"], t.devices.map((d) => [d.name[0].toUpperCase() + d.name.slice(1), num(d.count), pct(d.count, totalDev)]), "No data yet."));
    const errs = section("Form errors", "What stopped people at the form.");
    errs.append(table(["Problem", "Times"], t.errors.map((r) => [ERROR_LABELS[r.name] || r.name, num(r.count)]), "No form errors."));
    const other = section("Other clicks and pages");
    other.append(
      table(
        ["Event", "Count"],
        [
          ["“Judge my page” buttons outside the form", num(t.totals.cta_click)],
          ["Saw “Paused for a moment”", num(t.totals.queue_closed)],
          ["Privacy page views", num(t.totals["view:privacy"])],
          ["Terms page views", num(t.totals["view:terms"])],
        ],
        ""
      )
    );
    grid.append(countries, devices, errs, other);
    out.push(grid);
  }

  root.replaceChildren(...out);
}
