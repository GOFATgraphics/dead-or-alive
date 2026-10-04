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
  no_checkout_link: "Checkout link not connected",
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
const num = (v) => (v == null ? "—" : nf.format(v));
const pct = (a, b) => (!b || a == null ? "—" : `${Math.round((a / b) * 100)}%`);
const money = (cents, cur) => (cents == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: cur || "USD" }).format(cents / 100));
const hours = (h) => (h == null ? "—" : h < 1 ? `${Math.round(h * 60)} min` : `${h < 10 ? h.toFixed(1) : Math.round(h)} h`);
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
function barChart(rows, key, label, format = num) {
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

export function renderAnalytics(root, data) {
  const t = data.traffic;
  const b = data.business;
  const cur = b?.currency;
  const out = [];

  // Summary
  const tiles = el("div", "an-tiles");
  tiles.append(
    tile("Visitors", num(t?.totals.visitors), t ? `${num(t.totals.view)} page views` : "Connect Redis"),
    tile("Sent to checkout", num(t?.totals.checkout), t ? `${pct(t.totals.checkout, t.totals.homeVisitors)} of homepage visitors` : "Connect Redis"),
    tile("Paid orders", num(b?.totals.orders), b ? (t ? `${pct(b.totals.orders, t.totals.checkout)} of checkouts` : "") : "Connect Polar"),
    tile("Revenue", money(b?.totals.revenue, cur), b ? `${money(b.totals.averageOrder, cur)} per order` : "Connect Polar"),
    tile("Stamped", num(b?.totals.stamped), b ? `${num(b.totals.waitingNow)} waiting now` : "Connect Polar"),
    tile("Median turnaround", hours(b?.turnaround.medianHours), b?.turnaround.within24h != null ? `${Math.round(b.turnaround.within24h * 100)}% within 24 h` : "No stamps yet"),
    tile("Result page views", num(t?.totals["view:result"]), t ? `${num(t.totals.share_copy)} shares` : "Connect Redis"),
    tile("Came back from a stamp", num(t?.totals.result_cta), t ? "Clicked “Judge another page”" : "Connect Redis")
  );
  out.push(tiles);

  // Funnel
  const f = section("Funnel", "Visitors are counted once per day. Paid and stamped come from Polar and your published stamps.");
  f.append(
    funnel([
      { label: "Homepage visitors", value: t?.totals.homeVisitors },
      { label: "Clicked into the form", value: t?.totals.form_start },
      { label: "Pressed “Judge my page”", value: t?.totals.submit_try },
      { label: "Sent to checkout", value: t?.totals.checkout },
      { label: "Paid", value: b?.totals.orders, missing: "Connect Polar" },
      { label: "Stamped", value: b?.totals.stamped, missing: "Connect Polar" },
      { label: "Result page views", value: t?.totals["view:result"] },
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
    const c = section("Sent to checkout per day");
    c.append(barChart(t.daily, "checkouts", "Sent to checkout"));
    charts.append(c);
  }
  if (charts.childElementCount) out.push(charts);

  // Verdicts: each verdict has its own labeled row, so color is never the only cue.
  const v = section("Verdicts", "Stamped counts orders in this range. Views and copied links count result pages opened in this range.");
  const vrows = VERDICTS.map((name) => {
    const stamped = b?.verdicts[name];
    return [name, num(stamped), b ? pct(stamped, b.totals.stamped) : "—", num(t?.verdictViews[name]), num(t?.verdictShares[name])];
  });
  const vt = table(["Verdict", "Stamped", "Share", "Result views", "Links copied"], vrows, "");
  vt.querySelectorAll("tbody tr td:first-child").forEach((td) => {
    const name = td.textContent;
    td.replaceChildren(el("span", `word ${name.toLowerCase()}`, name));
  });
  v.append(vt);
  out.push(v);

  // Turnaround and money
  const two = el("div", "an-grid2");
  const ta = section("Turnaround", "Time from payment to the published stamp.");
  ta.append(
    table(
      ["Measure", "Value"],
      [
        ["Median", hours(b?.turnaround.medianHours)],
        ["Slowest 10% take", b?.turnaround.p90Hours != null ? `${hours(b.turnaround.p90Hours)} or more` : "—"],
        ["Within 24 hours", b?.turnaround.within24h != null ? `${Math.round(b.turnaround.within24h * 100)}%` : "—"],
        ["Stamps measured", num(b?.turnaround.count)],
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
        ["Refunds", b ? `${num(b.totals.refunds)} (${money(b.totals.refunded, cur)})` : "—"],
      ],
      ""
    )
  );
  two.append(ta, mo);
  out.push(two);

  // Where people come from, and what trips them up
  if (t) {
    const grid = el("div", "an-grid2");
    const ref = section("Sites sending visitors", "To the homepage. Add ?ref=name to links you post to see them here.");
    ref.append(table(["Source", "Visits"], t.referrers.map((r) => [r.name, num(r.count)]), "No outside sites yet."));
    const posts = section("Where stamps get opened", "Sites people came from when opening a result page: where stamps are being posted.");
    posts.append(table(["Source", "Opens"], t.resultReferrers.map((r) => [r.name, num(r.count)]), "No outside sites yet."));
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
          ["Saw “Queue is full”", num(t.totals.queue_closed)],
          ["Payment confirmed page views", num(t.totals["view:paid"])],
          ["Privacy page views", num(t.totals["view:privacy"])],
          ["Terms page views", num(t.totals["view:terms"])],
        ],
        ""
      )
    );
    grid.append(ref, posts, countries, devices, errs, other);
    out.push(grid);
  }

  root.replaceChildren(...out);
}
