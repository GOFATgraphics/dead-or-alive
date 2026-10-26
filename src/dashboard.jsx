import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./result.css";
import "./plans.css";
import "./dashboard.css";
import { Icon } from "./icons.jsx";
import { DESK, PLANS } from "./config.js";
import { REVIEW_STEPS, planHref, point } from "./plans.js";
import { track, trackView } from "./track.js";

// The dashboard: sign up or in, then everything a membership includes, in one place.
// URL: ?plan=killSheet|stayAlive&url=… (buying: account first, then checkout), ?paid=…&checkout_id=… (back from checkout),
// ?save=<stamp id> (save a free stamp), ?mode=signup|login, ?link=expired.

const params = new URLSearchParams(location.search);
const PLAN = PLANS[params.get("plan")] ? params.get("plan") : "";
const PAID = { kill_sheet: "killSheet", stay_alive: "stayAlive" }[params.get("paid")] || "";

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString([], { dateStyle: "medium" }) : "");
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");

function jobs() {
  try {
    return JSON.parse(localStorage.getItem("smp.jobs") || "[]");
  } catch (_) {
    return [];
  }
}

async function api(op, data = {}) {
  const r = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, ...data }) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 202) throw Object.assign(new Error(body.error || `Error ${r.status}.`), { body, status: r.status });
  return body;
}

function Bar({ user, onOut }) {
  return (
    <header className="bar">
      <a className="mark" href="/" aria-label="Stamp My Page home">
        <img src="/brand/smp-mark.svg" alt="" width="26" height="26" />
        <span>Stamp My Page</span>
      </a>
      <nav className="bar-links" aria-label="Sections">
        <a href="/pricing">Pricing</a>
        <a href="/#top">Stamp a page</a>
      </nav>
      {user ? (
        <button type="button" className="btn btn-line btn-sm" onClick={onOut}><Icon name="log-out" /> Sign out</button>
      ) : (
        <a className="btn btn-line btn-sm" href="/#top">Stamp my page</a>
      )}
    </header>
  );
}

function Foot() {
  return (
    <footer className="foot">
      <a className="mark" href="/"><img src="/brand/smp-mark.svg" alt="" width="22" height="22" /><span>Stamp My Page</span></a>
      <nav aria-label="Footer"><a href="/pricing">Pricing</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href={`mailto:${DESK.contact}`}>{DESK.contact}</a></nav>
      <span className="foot-meta">© Gofat Labs</span>
    </footer>
  );
}

// Signed out: create an account or sign in. When buying, say what happens next.
const X_NOTE = {
  noemail: "Your X account didn't share a confirmed email, and your plans are matched by email. Continue with email instead.",
  cancelled: "X sign-in was cancelled.",
  expired: "That X sign-in took too long. Try again.",
  failed: "X sign-in didn't work this time. Try again, or continue with email.",
  off: "Sign-in with X isn't switched on yet. Continue with email.",
};

function XLogo() {
  return <svg className="ic" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18.9 1.2h3.7l-8 9.1 9.4 12.5h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.8L.1 1.2h7.6l5.2 6.9 6-6.9Zm-1.3 19.4h2L6.5 3.2H4.3l13.3 17.4Z" /></svg>;
}

// Signed out: one form. Continue with X, or an email and password: a new email gets an account, a known one signs in.
function Auth({ setup, onIn }) {
  const [busy, setBusy] = useState(false);
  const xNote = X_NOTE[params.get("x")];
  const [msg, setMsg] = useState(params.get("link") === "expired" ? { bad: true, text: "That sign-in link expired or was already used. Send a new one." } : xNote ? { bad: true, text: xNote } : null);
  const [wrong, setWrong] = useState(false);
  const plan = PLANS[PLAN];
  // Where X sends them back to: the same dashboard URL (plan, page, stamp to save), minus old X notes.
  const next = (() => {
    const q = new URLSearchParams(location.search);
    q.delete("x");
    q.delete("link");
    const s = q.toString();
    return s ? `?${s}` : "";
  })();

  async function submit(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMsg(null);
    try {
      const out = await api("continue", { email: f.get("email"), password: f.get("password"), jobs: jobs(), next });
      if (out.sent) setMsg({ text: out.note || "Check your email for a sign-in link." });
      else {
        track(out.created ? "signup" : "login", { plan: PLAN || "none" });
        onIn(out);
      }
    } catch (err) {
      setWrong(err.body?.code === "wrongpass");
      setMsg({ bad: true, text: err.message });
    } finally {
      setBusy(false);
    }
  }
  async function link(e) {
    const form = e.currentTarget.closest("form");
    const email = new FormData(form).get("email");
    if (!email) return setMsg({ bad: true, text: "Enter your email first." });
    setBusy(true);
    try {
      await api("sendlink", { email, next });
      setMsg({ text: `We sent a sign-in link to ${email}. It works once, for 15 minutes.` });
    } catch (err) {
      setMsg({ bad: true, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="dash-auth wrap">
      <div className="auth-copy">
        {plan ? (
          <>
            <p className="eyebrow">Step 1 of 2</p>
            <h1>Create your free account, then check out.</h1>
            <p className="sect-sub">Your {plan.name} lands in this dashboard the moment your payment is confirmed. Use the email you'll pay with, so the payment finds your account.</p>
            <div className="auth-plan">
              <p><b>{plan.name}</b> · {plan.price} {plan.per}</p>
              <ul>{plan.points.map(point).map((x) => <li key={x.text}><Icon name="check" size={15} />{x.instant && <b className="pc-tag">Instant</b>} {x.text}</li>)}</ul>
            </div>
          </>
        ) : params.get("save") ? (
          <>
            <p className="eyebrow">Free account</p>
            <h1>Create a free account if you don't want to miss your result.</h1>
            <p className="sect-sub">Save this stamp, see all your stamps in one place, and get your free re-stamp after you fix it. No card.</p>
          </>
        ) : (
          <>
            <p className="eyebrow">Dashboard</p>
            <h1>Your stamps, plans, and reviews.</h1>
            <p className="sect-sub">Sign in to see every stamp you saved, your Kill Sheet, Stay Alive monitoring, and app reviews. A free account needs no card.</p>
          </>
        )}
      </div>

      <form className="auth-card" onSubmit={submit}>
        <h2 className="auth-h">{plan ? "Continue to checkout" : "Sign up or sign in"}</h2>
        {setup?.x && (
          <>
            <a className="btn btn-x" href={`/auth/x?next=${encodeURIComponent(next)}`} onClick={() => track("login", { via: "x", plan: PLAN || "none" })}><XLogo /> Continue with X</a>
            <p className="or"><span>or with email</span></p>
          </>
        )}
        <label>Email<input name="email" type="email" autoComplete="email" required maxLength={200} /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        <p className="fine">New here? Pick any password with 8 or more characters and your account is made. Been here before? Use the one you set.</p>
        <button className="btn btn-red" type="submit" disabled={busy}>{busy ? "One moment…" : "Continue"}</button>
        {msg && <p className={msg.bad ? "alert" : "note"} role={msg.bad ? "alert" : "status"}>{msg.text}</p>}
        {setup?.emailLinks && (wrong || !msg) && <button type="button" className="link quiet-link" onClick={link} disabled={busy}><Icon name="mail" /> {wrong ? "Forgot it? Email me a sign-in link" : "Or email me a sign-in link, no password"}</button>}
        <p className="fine">By continuing you agree to the <a href="/terms">terms</a> and <a href="/privacy">privacy policy</a>.</p>
      </form>
    </main>
  );
}

function Status({ status }) {
  const steps = [["received", "Received"], ["in_review", "In review"], ["delivered", "Delivered"]];
  const at = steps.findIndex(([k]) => k === status);
  return (
    <ol className="steps" aria-label={`Status: ${steps[at]?.[1] || status}`}>
      {steps.map(([k, label], i) => <li key={k} className={i < at ? "done" : i === at ? "now" : ""}>{label}</li>)}
    </ol>
  );
}

function Membership({ user, setup, onChange }) {
  const sa = user.stayAlive, ks = user.killSheet;
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  async function billing(op) {
    if (op === "cancel" && !confirm("Cancel Stay Alive? It stays on until the end of the month you paid for, then stops.")) return;
    setBusy(op);
    setErr("");
    try {
      const out = await api(op);
      if (out.portal) location.assign(out.portal);
      else onChange(out);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }
  if (!user.killSheetActive && !user.stayAliveActive) {
    return (
      <section className="panel" aria-labelledby="m-h">
        <div className="panel-head">
          <h2 id="m-h"><Icon name="user" /> Free account</h2>
          <p>Your stamps are saved here. Add a plan for the full-page scout, rewrites, monitoring, and an app review.</p>
        </div>
        {sa && sa.status !== "active" && <p className="note">Your Stay Alive membership ended{sa.endedAt ? ` on ${fmtDate(sa.endedAt)}` : ""}.</p>}
        <div className="mini-plans">
          {["killSheet", "stayAlive"].map((k) => (
            <a key={k} className="mini-plan" href={planHref(k)}>
              <b>{PLANS[k].name}</b>
              <span>{PLANS[k].price} {PLANS[k].per}</span>
              <em>{PLANS[k].pitch}</em>
            </a>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="panel member" aria-labelledby="m-h">
      <h2 id="m-h" className="sr-only">Membership</h2>
      <div className="badges">
        {user.killSheetActive && (
          <div className="mbadge">
            <p className="mb-top">Kill Sheet member</p>
            <p className="mb-name">You are a Kill Sheet member</p>
            <p className="mb-meta">Since {fmtDate(ks.since)} · {PLANS.killSheet.price} one-time · {ks.restampsLeft > 0 ? `${ks.restampsLeft} free re-stamp left` : "Re-stamp used"}</p>
          </div>
        )}
        {user.stayAliveActive && (
          <div className="mbadge alive">
            <p className="mb-top">Stay Alive member</p>
            <p className="mb-name">You are a Stay Alive member</p>
            <p className="mb-meta">Since {fmtDate(sa.since)} · {PLANS.stayAlive.price} {PLANS.stayAlive.per}</p>
            <p className="mb-meta">
              {sa.cancelAtPeriodEnd ? <>Cancelled. Stays on until <b>{fmtDate(sa.renews || sa.endsAt)}</b>, then stops. No more charges.</> : <>Next billing date: <b>{fmtDate(sa.renews)}</b></>}
            </p>
            <div className="mb-actions">
              {sa.cancelAtPeriodEnd ? (
                <button type="button" className="btn btn-line btn-sm" disabled={!!busy} onClick={() => billing("resume")}>{busy === "resume" ? "Resuming…" : "Keep Stay Alive"}</button>
              ) : (
                <button type="button" className="btn btn-line btn-sm" disabled={!!busy} onClick={() => billing("cancel")}>{busy === "cancel" ? "Cancelling…" : "Cancel Stay Alive"}</button>
              )}
              <a className="btn btn-line btn-sm" href={setup?.portal} target="_blank" rel="noopener noreferrer">Receipts and card</a>
            </div>
          </div>
        )}
      </div>
      {err && <p className="alert" role="alert">{err}</p>}
      {!user.stayAliveActive && <p className="fine">Want it watched every week? <a href={planHref("stayAlive")}>Add Stay Alive, {PLANS.stayAlive.price} {PLANS.stayAlive.per}</a>.</p>}
      {!user.killSheetActive && <p className="fine">Want the rewrite and full-page scout? <a href={planHref("killSheet")}>Get the Kill Sheet, {PLANS.killSheet.price} one-time</a>.</p>}
    </section>
  );
}

function PageForm({ plan, label, onDone }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      onDone(await api("url", { plan, url: new FormData(e.currentTarget).get("url") }));
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="inline-form" onSubmit={submit}>
      <label>{label}<input name="url" type="text" inputMode="url" placeholder="https://yourpage.com" defaultValue={params.get("url") || ""} required /></label>
      <button className="btn btn-red" type="submit" disabled={busy}>{busy ? "Starting…" : "Start now"}</button>
      {err && <p className="alert" role="alert">{err}</p>}
    </form>
  );
}

function Working({ text }) {
  return <p className="working"><span className="spin" aria-hidden="true"></span>{text}</p>;
}

function KillSheet({ user, report, onChange }) {
  const ks = user.killSheet;
  const [err, setErr] = useState("");
  async function restamp() {
    setErr("");
    try {
      onChange(await api("restamp"));
    } catch (e) {
      setErr(e.message);
    }
  }
  return (
    <section className="panel" aria-labelledby="ks-h">
      <div className="panel-head">
        <h2 id="ks-h"><Icon name="clipboard-list" /> Your Kill Sheet</h2>
        {report?.url && <p>For <a href={report.url} target="_blank" rel="noopener noreferrer">{report.url}</a>{report.finishedAt ? ` · ${fmtTime(report.finishedAt)}` : ""}</p>}
      </div>
      {!ks.url && !report && <PageForm plan="killSheet" label="Which page should we scout?" onDone={onChange} />}
      {report?.status === "working" && <Working text="Scouting your whole page, rewriting the copy, ranking the fixes. About a minute." />}
      {report?.status === "failed" && (
        <>
          <p className="alert">The scout couldn't finish: {report.error}</p>
          <PageForm plan="killSheet" label="Try again, or try another page" onDone={onChange} />
        </>
      )}
      {report?.status === "ready" && (
        <div className="report">
          {report.stamp && (
            <a className={"r-stamp v-" + report.stamp.verdict.toLowerCase()} href={`/v/${report.stamp.id}`}>
              <img src={report.stamp.image} alt="" loading="lazy" />
              <span><b>{report.stamp.verdict}</b> {report.stamp.score}/100{ks.before && ks.before.id !== report.stamp.id ? ` · was ${ks.before.verdict} ${ks.before.score}` : ""}</span>
              <em>“{report.stamp.sentence}”</em>
            </a>
          )}
          {report.stampError && <p className="note">The first-screen stamp didn't run this time ({report.stampError}). The rest of the sheet is from the page's HTML.</p>}

          <h3>Fixes, ranked by impact</h3>
          <ol className="fixes">
            {report.fixes.map((f, i) => (
              <li key={f.title}>
                <span className={"imp " + f.impact.toLowerCase()}>{f.impact}</span>
                <b>{i + 1}. {f.title}</b>
                <p>{f.problem}</p>
                <p className="fix"><b>Fix</b> {f.fix}</p>
                <small>{f.from}</small>
              </li>
            ))}
          </ol>

          <h3>Your copy, rewritten</h3>
          <p className="fine">Built from the words already on your page, shaped to pass every first-screen check. Brackets mark what only you know.</p>
          <div className="rewrite">
            <div><p className="rw-label">Headline now</p><p className="rw-old">{report.rewrites.before.headline || "No headline found"}</p></div>
            <div><p className="rw-label">Headline options</p>{report.rewrites.headlines.map((h) => <p key={h} className="rw-new">{h}</p>)}</div>
            <div><p className="rw-label">Subhead now</p><p className="rw-old">{report.rewrites.before.subhead || "No subhead found"}</p></div>
            <div><p className="rw-label">Subhead</p><p className="rw-new">{report.rewrites.subhead}</p></div>
            <div><p className="rw-label">Buttons now</p><p className="rw-old">{report.rewrites.before.buttons.join(", ") || "No buttons found"}</p></div>
            <div><p className="rw-label">Button</p><p className="rw-new">{report.rewrites.button} <span className="rw-sec">Second: {report.rewrites.secondary}</span></p></div>
          </div>

          {report.scout && (
            <>
              <h3>The whole page, scouted</h3>
              <dl className="scout">
                <div><dt>Words</dt><dd>{report.scout.words}</dd></div>
                <div><dt>Sections</dt><dd>{report.scout.sections.length}</dd></div>
                <div><dt>Buttons asking for action</dt><dd>{report.scout.ctaCount}</dd></div>
                <div><dt>Proof</dt><dd>{report.scout.proof || report.scout.stat || (report.scout.logos ? `${report.scout.logos} logos` : "None found")}</dd></div>
                <div><dt>Risk reversal</dt><dd>{report.scout.riskReversal || "None found"}</dd></div>
                <div><dt>Pricing shown</dt><dd>{report.scout.pricing ? "Yes" : "No"}</dd></div>
                <div><dt>FAQ</dt><dd>{report.scout.faq ? "Yes" : "No"}</dd></div>
                <div><dt>Longest form</dt><dd>{report.scout.forms ? `${report.scout.longestForm} fields` : "No form"}</dd></div>
                <div><dt>“You” vs “we”</dt><dd>{report.scout.you} / {report.scout.we}</dd></div>
              </dl>
              {report.scout.sections.length > 0 && <p className="fine">Sections found: {report.scout.sections.join(" · ")}</p>}
            </>
          )}
          {report.scoutError && <p className="note">{report.scoutError}</p>}
          {report.fullShot && <p><a className="btn btn-line btn-sm" href={report.fullShot} target="_blank" rel="noopener noreferrer"><Icon name="image" /> Full-page screenshot</a></p>}

          <div className="restamp">
            <div>
              <b>Shipped the fixes?</b>
              <p>{ks.restampsLeft > 0 ? "Use your free re-stamp: we run the whole sheet again and show the before and after." : "Your free re-stamp is used. You can still stamp the page free from the homepage any time."}</p>
            </div>
            {ks.restampsLeft > 0 && <button type="button" className="btn btn-dark" onClick={restamp}><Icon name="rotate-ccw" /> Re-stamp now</button>}
          </div>
          {err && <p className="alert" role="alert">{err}</p>}
        </div>
      )}
    </section>
  );
}

function StayAlive({ user, monitor, onChange }) {
  const sa = user.stayAlive;
  const checks = monitor?.checks || [];
  const last = checks[checks.length - 1];
  const up = checks.length ? Math.round((checks.filter((c) => c.ok).length / checks.length) * 1000) / 10 : null;
  const avg = checks.filter((c) => c.ok).length ? Math.round(checks.filter((c) => c.ok).reduce((a, c) => a + c.ms, 0) / checks.filter((c) => c.ok).length) : null;
  const restamps = [...(monitor?.restamps || [])].reverse();
  const next = monitor?.lastRestampAt ? new Date(new Date(monitor.lastRestampAt).getTime() + 7 * 86400000).toISOString() : "";
  const maxMs = Math.max(1, ...checks.slice(-30).map((c) => c.ms || 0));
  return (
    <section className="panel" aria-labelledby="sa-h">
      <div className="panel-head">
        <h2 id="sa-h"><Icon name="activity" /> Stay Alive monitoring</h2>
        {sa.url && <p>Watching <a href={sa.url} target="_blank" rel="noopener noreferrer">{sa.url}</a></p>}
      </div>
      {!sa.url && <PageForm plan="stayAlive" label="Which page should we watch?" onDone={onChange} />}
      {sa.url && !monitor && <Working text="Switching monitoring on: first uptime check and re-stamp are running." />}
      {monitor && (
        <>
          <dl className="scout">
            <div><dt>Right now</dt><dd className={last?.ok ? "ok" : "bad"}>{last ? (last.ok ? `Up · ${last.status}` : `Down · ${last.status || last.error}`) : "Checking…"}</dd></div>
            <div><dt>Uptime</dt><dd>{up != null ? `${up}%` : "—"} <small>last {checks.length} checks</small></dd></div>
            <div><dt>Server answers in</dt><dd>{avg != null ? `${avg} ms` : "—"} <small>average</small></dd></div>
            <div><dt>Last check</dt><dd>{fmtTime(monitor.lastCheckAt)}</dd></div>
            <div><dt>Next re-stamp</dt><dd>{monitor.restampRunning ? "Running now" : next ? fmtDate(next) : "Soon"}</dd></div>
          </dl>
          {checks.length > 1 && (
            <div className="spark" aria-label="Response time, last 30 checks">
              {checks.slice(-30).map((c) => <span key={c.at} className={c.ok ? "" : "down"} title={`${fmtTime(c.at)}: ${c.ok ? `${c.ms} ms` : "down"}`} style={{ height: `${c.ok ? Math.max(8, (c.ms / maxMs) * 100) : 100}%` }}></span>)}
            </div>
          )}
          {monitor.restampRunning && <Working text="Re-stamping your page now." />}
          <h3>Weekly re-stamps</h3>
          {restamps.length ? (
            <ul className="history">
              {restamps.map((r) =>
                r.failed ? (
                  <li key={r.at}><span className="v-chip">—</span><span>Couldn't stamp: {r.failed}</span><time>{fmtDate(r.at)}</time></li>
                ) : (
                  <li key={r.at}><span className={"v-chip v-" + r.verdict.toLowerCase()}>{r.verdict}</span><a href={`/v/${r.id}`}>{r.score}/100{r.lcp ? ` · main content in ${(r.lcp / 1000).toFixed(1)}s` : ""}</a><time>{fmtDate(r.at)}</time></li>
                )
              )}
            </ul>
          ) : (
            <p className="fine">The first re-stamp shows here as soon as it's done.</p>
          )}
        </>
      )}
    </section>
  );
}

function Reviews({ user, onChange }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState(false);
  const left = user.reviewsLeft?.total || 0;
  async function submit(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErr("");
    try {
      const out = await api("review", {
        siteUrl: f.get("siteUrl"),
        appUrl: f.get("appUrl"),
        what: f.get("what"),
        loginEmail: login ? f.get("loginEmail") : "",
        loginPassword: login ? f.get("loginPassword") : "",
        throwaway: login ? f.get("throwaway") === "on" : false,
      });
      e.target.reset();
      setLogin(false);
      track("review_submit");
      onChange(out);
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id) {
    if (!confirm("Delete the test login for this review now? We won't be able to test anything behind the login.")) return;
    try {
      onChange(await api("revoke", { id }));
    } catch (x) {
      setErr(x.message);
    }
  }
  const reviews = user.reviews || [];
  return (
    <section className="panel" aria-labelledby="rv-h">
      <div className="panel-head">
        <h2 id="rv-h"><Icon name="search" /> App review</h2>
        <p>{user.member ? (left ? "Included with your membership. A person tests it end to end, and the result comes back here." : "Your included review is in. Stay Alive members get a new one every billing month.") : "Included with the Kill Sheet and Stay Alive."}</p>
      </div>
      <ol className="how">{REVIEW_STEPS.map((x) => <li key={x}>{x}</li>)}</ol>

      {user.member && left > 0 && (
        <form className="review-form" onSubmit={submit}>
          <div className="row2">
            <label>Site URL<input name="siteUrl" type="text" inputMode="url" placeholder="https://yourapp.com" defaultValue={user.killSheet?.url || user.stayAlive?.url || ""} /></label>
            <label>App Store or Play link <span className="opt">optional</span><input name="appUrl" type="url" placeholder="https://apps.apple.com/…" /></label>
          </div>
          <label>What to test, back to back<textarea name="what" rows={4} required minLength={10} maxLength={3000} placeholder="1. Land on the homepage logged out. 2. Sign up with email. 3. Finish onboarding. 4. Create your first project. Tell us where you'd expect people to get stuck." /></label>
          <label className="check"><input type="checkbox" checked={login} onChange={(e) => setLogin(e.target.checked)} /> It needs a login to test the core flow</label>
          {login && (
            <div className="login-box">
              <p className="warn-line"><Icon name="lock" /> <span><b>It must be a throwaway test account, never your main account, with no real data and no saved card.</b> We encrypt it, use it only for this review, and delete it after. You can revoke it here at any time.</span></p>
              <div className="row2">
                <label>Test account email<input name="loginEmail" type="text" autoComplete="off" required maxLength={200} /></label>
                <label>Test account password<input name="loginPassword" type="password" autoComplete="new-password" required maxLength={200} /></label>
              </div>
              <label className="check"><input name="throwaway" type="checkbox" required /> This is a throwaway test account with no real data and no saved card.</label>
            </div>
          )}
          <button className="btn btn-red" type="submit" disabled={busy}>{busy ? "Sending…" : "Send for review"}</button>
        </form>
      )}
      {!user.member && (
        <div className="mini-plans">
          {["killSheet", "stayAlive"].map((k) => (
            <a key={k} className="mini-plan" href={planHref(k)}><b>{PLANS[k].name}</b><span>{PLANS[k].price} {PLANS[k].per}</span><em>{k === "killSheet" ? "Includes one app review" : "Includes one app review a month"}</em></a>
          ))}
        </div>
      )}
      {err && <p className="alert" role="alert">{err}</p>}

      {reviews.length > 0 && (
        <ul className="reviews">
          {reviews.map((r) => (
            <li key={r.id}>
              <div className="rv-top">
                <b>{r.siteUrl || r.appUrl}</b>
                <time>Sent {fmtDate(r.createdAt)}</time>
              </div>
              <Status status={r.status} />
              <p className="fine">
                {r.login === "stored" && <>Test login stored, encrypted. <button type="button" className="link" onClick={() => revoke(r.id)}>Revoke it now</button></>}
                {r.login === "revoked" && `Test login revoked by you on ${fmtDate(r.loginGoneAt)}.`}
                {r.login === "deleted" && `Test login deleted after the review, on ${fmtDate(r.loginGoneAt)}.`}
                {r.login === "none" && "No test login."}
              </p>
              {r.status === "delivered" && r.result && (
                <div className="rv-result">
                  {r.result.summary && <p>{r.result.summary}</p>}
                  {r.result.problems?.length > 0 && (<><h4>Problems found</h4><ul>{r.result.problems.map((p) => <li key={p}>{p}</li>)}</ul></>)}
                  {r.result.fixes?.length > 0 && (<><h4>Fixes, ranked</h4><ol>{r.result.fixes.map((p) => <li key={p}>{p}</li>)}</ol></>)}
                  {r.result.copy && (<><h4>Rewritten copy</h4><p className="rv-copy">{r.result.copy}</p></>)}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Stamps({ user }) {
  const stamps = user.stamps || [];
  return (
    <section className="panel" aria-labelledby="st-h">
      <div className="panel-head">
        <h2 id="st-h"><Icon name="list-checks" /> Your stamps</h2>
        <p>Every stamp you've saved, newest first. Stamps you make in this browser are saved automatically while you're signed in.</p>
      </div>
      {stamps.length ? (
        <ul className="history">
          {stamps.map((s) => (
            <li key={s.id}>
              <span className={"v-chip v-" + s.verdict.toLowerCase()}>{s.verdict}</span>
              <a href={`/v/${s.id}`}>{s.icon && <img src={s.icon} alt="" width="16" height="16" />}{s.host}{s.score != null ? ` · ${s.score}/100` : ""}</a>
              <time>{fmtDate(s.at)}</time>
            </li>
          ))}
        </ul>
      ) : (
        <p className="fine">No stamps saved yet. <a href="/#top">Stamp a page free</a>; it's saved here when you're signed in.</p>
      )}
    </section>
  );
}

function Settings({ user, onOut }) {
  const [msg, setMsg] = useState(null);
  async function setPassword(e) {
    e.preventDefault();
    try {
      await api("password", { password: new FormData(e.currentTarget).get("password") });
      setMsg({ text: "Password saved." });
      e.target.reset();
    } catch (x) {
      setMsg({ bad: true, text: x.message });
    }
  }
  async function del() {
    const c = prompt("This deletes your account, saved stamps list, reports, and any stored test logins. Type DELETE to confirm.");
    if (c !== "DELETE") return;
    try {
      await api("delete", { confirm: c });
      onOut();
    } catch (x) {
      setMsg({ bad: true, text: x.message });
    }
  }
  return (
    <section className="panel quiet" aria-labelledby="set-h">
      <div className="panel-head"><h2 id="set-h"><Icon name="lock" /> Account</h2><p>Signed in as <b>{user.email}</b>.</p></div>
      <form className="inline-form" onSubmit={setPassword}>
        <label>{user.hasPassword ? "Change password" : "Set a password (you signed in with an email link)"}<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
        <button className="btn btn-line" type="submit">Save</button>
      </form>
      {msg && <p className={msg.bad ? "alert" : "note"}>{msg.text}</p>}
      <p className="fine"><button type="button" className="link danger" onClick={del}><Icon name="trash" /> Delete my account</button></p>
    </section>
  );
}

function Dashboard({ data, setData, onOut }) {
  const { user, report, monitor, setup } = data;
  const [banner, setBanner] = useState(PAID ? "confirming" : PLAN ? "checkout" : "");
  const [err, setErr] = useState("");
  const tries = useRef(0);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/account", { cache: "no-store" });
    if (r.ok) setData(await r.json());
  }, [setData]);

  // Buying: account done, so straight to checkout with this email.
  useEffect(() => {
    if (!PLAN) return;
    if ((PLAN === "stayAlive" && user.stayAliveActive) || (PLAN === "killSheet" && user.killSheetActive && !params.get("again"))) {
      setBanner("");
      return;
    }
    api("checkout", { plan: PLAN, url: params.get("url") || "" })
      .then((out) => {
        track("checkout_start", { plan: PLAN });
        location.assign(out.url);
      })
      .catch((e) => {
        setBanner("");
        setErr(e.message);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Back from checkout: confirm right away when the server can, and watch for the webhook either way.
  useEffect(() => {
    if (!PAID) return;
    const id = params.get("checkout_id");
    if (id) api("confirm", { checkoutId: id }).then((out) => out.user && setData((d) => ({ ...d, ...out }))).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const active = PAID === "killSheet" ? user.killSheetActive : PAID === "stayAlive" ? user.stayAliveActive : false;
  useEffect(() => {
    if (banner === "confirming" && active) {
      setBanner("active");
      history.replaceState(null, "", "/dashboard");
    }
  }, [active, banner]);

  // Poll while anything is running: payment confirmation, the scout, a re-stamp, the first monitor run.
  const running = banner === "confirming" || report?.status === "working" || monitor?.restampRunning || (user.stayAliveActive && user.stayAlive?.url && !monitor);
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => {
      tries.current++;
      if (banner === "confirming" && tries.current > 60) setBanner("slow");
      refresh();
    }, 3000);
    return () => clearTimeout(t);
  }, [running, data, banner, refresh]);

  // Free stamps from this browser: saved as soon as you're in.
  useEffect(() => {
    const j = jobs();
    if (j.length) api("claim", { jobs: j }).then((out) => out.saved && out.user && setData((d) => ({ ...d, ...out }))).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = (out) => out?.user !== undefined && setData((d) => ({ ...d, ...out }));
  const first = user.email.split("@")[0];

  return (
    <main className="dash wrap">
      {banner === "checkout" && <div className="banner"><Working text={`Taking you to secure checkout for the ${PLANS[PLAN].name}, with ${user.email} filled in…`} /></div>}
      {banner === "confirming" && <div className="banner"><Working text="Payment received. Switching your membership on…" /></div>}
      {banner === "slow" && <div className="banner warn">Your payment hasn't been confirmed to us yet. This page keeps checking; if it takes more than a few minutes, write to {DESK.contact} with your receipt.</div>}
      {banner === "active" && <div className="banner ok"><Icon name="check" /> {PAID === "killSheet" ? "You're a Kill Sheet member. Your sheet is running below." : "You're a Stay Alive member. Monitoring is on."}</div>}
      {err && <p className="alert" role="alert">{err}</p>}

      <div className="dash-head">
        <p className="eyebrow">Dashboard</p>
        <h1>Hi, {first}.</h1>
      </div>

      <Membership user={user} setup={setup} onChange={onChange} />
      {user.killSheetActive && <KillSheet user={user} report={report} onChange={onChange} />}
      {user.stayAliveActive && <StayAlive user={user} monitor={monitor} onChange={onChange} />}
      <Reviews user={user} onChange={onChange} />
      <Stamps user={user} />
      <Settings user={user} onOut={onOut} />
    </main>
  );
}

function App() {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");
  useEffect(() => {
    trackView("dashboard");
    fetch("/api/account", { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        setData(body);
        setState(r.status === 503 ? "off" : r.ok ? "ready" : "error");
      })
      .catch(() => setState("error"));
  }, []);
  async function out() {
    await api("logout").catch(() => {});
    setData((d) => ({ ...d, user: null }));
  }
  const user = data?.user;
  return (
    <div className="page">
      <Bar user={user} onOut={out} />
      {state === "loading" && <main className="dash wrap"><Working text="Opening your dashboard…" /></main>}
      {state === "off" && <main className="dash wrap"><p className="note">Accounts are being switched on. Try again in a few minutes, or write to {DESK.contact}.</p></main>}
      {state === "error" && <main className="dash wrap"><p className="alert">Couldn't reach the dashboard. Check your connection and reload.</p></main>}
      {state === "ready" && (user ? <Dashboard data={data} setData={setData} onOut={out} /> : <Auth setup={data?.setup} onIn={(d) => setData((x) => ({ ...x, ...d }))} />)}
      <Foot />
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
