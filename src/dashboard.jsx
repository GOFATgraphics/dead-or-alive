import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./result.css";
import "./plans.css";
import "./dashboard.css";
import { Icon } from "./icons.jsx";
import { Toast } from "./toast.jsx";
import { DESK, PLANS } from "./config.js";
import { REVIEW_STEPS, planHref, point } from "./plans.js";
import { track, trackView } from "./track.js";
import { embedSvg, svgUri, tierFor } from "./badge.js";
import { snapshotRows } from "./snapshot.js";
import { hasChecked, markChecked } from "./checked.js";

// The dashboard: sign up or in, then everything a membership includes, in one place.
// URL: ?plan=killSheet|stayAlive&url=… (buying: account first, then checkout), ?paid=…&checkout_id=… (back from checkout),
// ?save=<stamp id> (save a free stamp), ?claim=<stamp id> (manual site claim), ?mode=signup|login, ?link=expired.

const params = new URLSearchParams(location.search);
const PLAN = PLANS[params.get("plan")] ? params.get("plan") : "";
// Stay Alive can be billed yearly: ?plan=stayAlive&billing=yearly.
const YEARLY = PLAN === "stayAlive" && params.get("billing") === "yearly";
const PLAN_NAME = PLAN ? `${PLANS[PLAN].name}${YEARLY ? ", billed yearly" : ""}` : "";
const planPrice = (k, yearly) => (yearly && PLANS[k].yearly ? `${PLANS[k].yearly.price} ${PLANS[k].yearly.per}` : `${PLANS[k].price} ${PLANS[k].per}`);
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

// Once this browser's stamps are saved to an account, the browser forgets them, so a different account
// signing in here later starts clean.
function forgetJobs(sent) {
  try {
    const left = jobs().filter((j) => !sent.includes(j));
    left.length ? localStorage.setItem("smp.jobs", JSON.stringify(left)) : localStorage.removeItem("smp.jobs");
  } catch (_) {}
}

async function api(op, data = {}) {
  const r = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, ...data }) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 202) throw Object.assign(new Error(body.error || `Error ${r.status}.`), { body, status: r.status });
  return body;
}


function Copy({ text, label, done = "Copied", className = "btn btn-line btn-sm" }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className={className} onClick={async () => {
      try { await navigator.clipboard.writeText(text); } catch (_) {
        const el = document.createElement("textarea"); el.value = text; document.body.appendChild(el); el.select(); document.execCommand("copy"); el.remove();
      }
      setOk(true); setTimeout(() => setOk(false), 2000);
    }}>{ok ? done : label}</button>
  );
}

// Badge embed code for one stamp, steel or dark, as on the result page.
function badgeEmbed(s, theme) {
  const origin = location.origin;
  return `<a href="${origin}/v/${s.id}"><img src="${origin}/badge/${s.id}${theme === "steel" ? "" : `?theme=${theme}`}" alt="${s.host}, alive on Stamp My Page" width="300" height="64"></a>`;
}

function Bar({ user, onOut }) {
  return (
    <header className="bar">
      <a className="mark" href="/" aria-label="Stamp My Page home">
        <img src="/brand/smp-mark.svg" alt="" width="26" height="26" />
        <span>Stamp My Page</span>
      </a>
      {user ? (
        <div className="who">
          <span className="avatar" aria-hidden="true">{user.email[0].toUpperCase()}</span>
          <span className="who-email">{user.email}</span>
          <button type="button" className="btn btn-line btn-sm" onClick={onOut}>Sign out</button>
        </div>
      ) : (
        <>
          <nav className="bar-links" aria-label="Sections">
            <a href="/#top">Stamp a page</a>
          </nav>
          <a className="btn btn-line btn-sm" href="/#top">Stamp my page</a>
        </>
      )}
    </header>
  );
}

function Foot() {
  return (
    <footer className="foot">
      <a className="mark" href="/"><img src="/brand/smp-mark.svg" alt="" width="22" height="22" /><span>Stamp My Page</span></a>
      <nav aria-label="Footer"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href={`mailto:${DESK.contact}`}>{DESK.contact}</a></nav>
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
  const [codeFor, setCodeFor] = useState("");
  const [forgot, setForgot] = useState(false);
  const [resetFor, setResetFor] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [resetVerified, setResetVerified] = useState(false);
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
      if (out.sent) {
        if (out.code) setCodeFor(f.get("email"));
        setMsg({ text: out.note || "Check your email for a sign-in link." });
      }
      else {
        track(out.created ? "signup" : "login", { plan: PLAN || "none" });
        onIn(out);
      }
    } catch (err) {
      setMsg({ bad: true, text: err.message });
    } finally {
      setBusy(false);
    }
  }
  // Resend the code inside the code box only. There is no link or code option on the main form:
  // email, password, Continue, then the code. That's the whole sign-in.
  async function sendCode(e) {
    const form = e.currentTarget.closest("form");
    const email = (form && new FormData(form).get("email")) || codeFor;
    if (!email) return setMsg({ bad: true, text: "Enter your email first." });
    setBusy(true);
    try {
      const out = await api("sendcode", { email, next });
      setCodeFor(email);
      setMsg({ text: out.note || `We sent a code to ${email}.` });
    } catch (err) {
      setMsg({ bad: true, text: err.message });
    } finally {
      setBusy(false);
    }
  }
  // Forgot password: a link on the form, not a sign-in option. It opens a reset card: email, then a
  // code, then a new password. After the reset, the user signs in the normal way.
  function openForgot(e) {
    const form = e.currentTarget.closest("form");
    const email = form && new FormData(form).get("email");
    if (email) setResetFor(email);
    setForgot(true);
    setResetSent(false);
    setResetVerified(false);
    setResetToken("");
    setMsg(null);
  }
  async function sendReset(e) {
    if (e.preventDefault) e.preventDefault();
    const form = e.currentTarget.closest("form");
    const email = (form && new FormData(form).get("email")) || resetFor;
    if (!email) return setMsg({ bad: true, text: "Enter your email first." });
    setBusy(true);
    setMsg(null);
    try {
      const out = await api("forgot", { email });
      setResetFor(email);
      setResetSent(true);
      setMsg({ text: out.note || `We sent a code to ${email}.` });
    } catch (err) {
      setMsg({ bad: true, text: err.message });
    } finally {
      setBusy(false);
    }
  }
  async function verifyResetCode(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMsg(null);
    try {
      const out = await api("verify-reset-code", { email: resetFor, token: f.get("code") });
      setResetToken(out.resetToken);
      setResetVerified(true);
      setMsg({ text: out.note || "Code confirmed. Create your new password." });
    } catch (err) {
      setMsg({ bad: true, text: err.message });
    } finally {
      setBusy(false);
    }
  }
  async function resetPassword(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) return setMsg({ bad: true, text: "The two passwords don't match. Type them again." });
    setBusy(true);
    setMsg(null);
    try {
      const out = await api("reset-password", { resetToken, password: f.get("password"), confirm: f.get("confirm") });
      setForgot(false);
      setResetSent(false);
      setResetVerified(false);
      setResetToken("");
      setResetFor("");
      setMsg({ text: out.note || "Password changed. Sign in with your new password." });
    } catch (err) {
      setMsg({ bad: true, text: err.message });
    } finally {
      setBusy(false);
    }
  }
  async function verifyCode(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMsg(null);
    try {
      const out = await api("verify-code", { email: codeFor, token: f.get("code"), jobs: jobs(), next });
      track("login", { plan: PLAN || "none" });
      onIn(out);
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
              <p><b>{PLAN_NAME}</b>{hasChecked() && ` · ${planPrice(PLAN, YEARLY)}`}</p>
              <ul>{plan.points.map(point).map((x) => <li key={x.text}><Icon name="check" size={15} />{x.text.charAt(0).toUpperCase() + x.text.slice(1)}</li>)}</ul>
            </div>
          </>
        ) : params.get("save") ? (
          <>
            <p className="eyebrow">Free account</p>
            <h1>Create a free account to save it.</h1>
            <p className="sect-sub">Keep this stamp, see all your stamps in one place, and get a free re-stamp after you fix it. No card.</p>
          </>
        ) : (
          <>
            <p className="eyebrow">Dashboard</p>
            <h1>Your stamps, plans, and reviews.</h1>
            <p className="sect-sub">Sign in to see every stamp you saved, your Kill Sheet, Stay Alive monitoring, and app reviews. A free account needs no card.</p>
          </>
        )}
      </div>

      {!forgot && !codeFor && (<form className="auth-card" onSubmit={submit}>
        <h2 className="auth-h">{plan ? "Continue to checkout" : "Sign up or sign in"}</h2>
        {setup?.x && (
          <>
            <a className="btn btn-x" href={`/auth/x?next=${encodeURIComponent(next)}`} onClick={() => track("login", { via: "x", plan: PLAN || "none" })}><XLogo /> Continue with X</a>
            <p className="or"><span>or with email</span></p>
          </>
        )}
        <label>Email<input name="email" type="email" autoComplete="email" required maxLength={200} /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        <button type="button" className="link quiet-link" onClick={openForgot} disabled={busy}>Forgot password?</button>
        <p className="fine">New here? Pick any password with 8 or more characters, then enter the code we send to your email. Been here before? Use the one you set, then enter the code we send.</p>
        <button className="btn btn-red" type="submit" disabled={busy}>{busy ? "One moment…" : "Continue"}</button>
        {msg && <p className={msg.bad ? "alert" : "note"} role={msg.bad ? "alert" : "status"}>{msg.text}</p>}
        <p className="fine">By continuing you agree to the <a href="/terms">terms</a> and <a href="/privacy">privacy policy</a>.</p>
      </form>)}
      {forgot && (
        <form className="auth-card" onSubmit={resetVerified ? resetPassword : resetSent ? verifyResetCode : sendReset}>
          <h2 className="auth-h">Reset your password</h2>
          <p className="sect-sub">Enter your email, we send a code. Enter the code, then create a new password and confirm it. After that, sign in with the new password.</p>
          {!resetVerified && <label>Email<input name="email" type="email" autoComplete="email" required maxLength={200} defaultValue={resetFor} /></label>}
          {resetSent && !resetVerified && <label>Code<input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" required maxLength={8} placeholder="Enter code" /></label>}
          {resetVerified && (<>
            <label>Create new password<input name="password" type="password" autoComplete="new-password" required /></label>
            <label>Confirm new password<input name="confirm" type="password" autoComplete="new-password" required /></label>
          </>)}
          <button className="btn btn-red" type="submit" disabled={busy}>{busy ? "One moment…" : resetVerified ? "Set new password" : resetSent ? "Verify code" : "Send reset code"}</button>
          {msg && <p className={msg.bad ? "alert" : "note"} role={msg.bad ? "alert" : "status"}>{msg.text}</p>}
          {resetSent && !resetVerified && <button type="button" className="link quiet-link" onClick={sendReset} disabled={busy}>Send a new code</button>}
          <button type="button" className="link quiet-link" onClick={() => { setForgot(false); setResetSent(false); setResetVerified(false); setResetToken(""); setMsg(null); }} disabled={busy}>Back to sign in</button>
        </form>
      )}
      {codeFor && (
        <form className="auth-card" onSubmit={verifyCode}>
          <h2 className="auth-h">Enter the code</h2>
          <p className="sect-sub">We sent a code to {codeFor}. Enter it to finish signing in.</p>
          <label>Code<input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" required maxLength={8} placeholder="Enter code" /></label>
          <button className="btn btn-red" type="submit" disabled={busy}>{busy ? "One moment…" : "Verify code"}</button>
          {msg && <p className={msg.bad ? "alert" : "note"} role={msg.bad ? "alert" : "status"}>{msg.text}</p>}
          <button type="button" className="link quiet-link" onClick={sendCode} disabled={busy}>Send a new code</button>
          <button type="button" className="link quiet-link" onClick={() => { setCodeFor(""); setMsg(null); }} disabled={busy}>Use a different email</button>
        </form>
      )}
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

// What each plan is, as quiet rows with a price and one action. Used wherever a plan isn't on yet.
// Before a first free check there are no prices: one row that sends them to stamp a page.
function PlanRows({ user, only }) {
  const keys = (only ? [only] : ["killSheet", "stayAlive"]).filter((k) => !(k === "killSheet" ? user.killSheetActive : user.stayAliveActive));
  if (!keys.length) return null;
  if (!hasChecked(user)) return <FirstCheck />;
  return (
    <div className="plan-rows">
      {keys.map((k) => (
        <div key={k} className="plan-row">
          <div>
            <p className="pr-name">{PLANS[k].name} <span>{PLANS[k].price} {PLANS[k].per}</span></p>
            <p className="pr-pitch">{PLANS[k].pitch}</p>
          </div>
          <a className="btn btn-dark btn-sm" href={planHref(k)}>{k === "killSheet" ? "Get it" : "Start"}</a>
        </div>
      ))}
    </div>
  );
}

// Plans and billing, for the Account section.
function Billing({ user, setup, onChange }) {
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
  return (
    <Panel title="Plan and billing" desc={user.member ? "Your memberships, dates, and billing." : "You're on the free plan."}>
      <dl className="kv">
        <div><dt>Plan</dt><dd>{[user.killSheetActive && "Kill Sheet", user.stayAliveActive && "Stay Alive"].filter(Boolean).join(" + ") || "Free"}</dd></div>
        {user.killSheetActive && <div><dt>Kill Sheet</dt><dd>Since {fmtDate(ks.since)} · {PLANS.killSheet.price} one-time · {ks.restampsLeft > 0 ? "1 free re-stamp left" : "Re-stamp used"}</dd></div>}
        {user.stayAliveActive && (
          <div>
            <dt>Stay Alive</dt>
            <dd>
              Since {fmtDate(sa.since)} · {planPrice("stayAlive", sa.interval === "year")}
              <br />
              {sa.cancelAtPeriodEnd ? <>Cancelled. On until <b>{fmtDate(sa.renews || sa.endsAt)}</b>, then stops. No more charges.</> : <>Next billing date <b>{fmtDate(sa.renews)}</b></>}
            </dd>
          </div>
        )}
        {sa && !user.stayAliveActive && <div><dt>Stay Alive</dt><dd>Ended{sa.endedAt ? ` ${fmtDate(sa.endedAt)}` : ""}</dd></div>}
      </dl>
      {user.stayAliveActive && (
        <div className="row-actions">
          {sa.cancelAtPeriodEnd ? (
            <button type="button" className="btn btn-line btn-sm" disabled={!!busy} onClick={() => billing("resume")}>{busy === "resume" ? "Resuming…" : "Keep Stay Alive"}</button>
          ) : (
            <button type="button" className="btn btn-line btn-sm" disabled={!!busy} onClick={() => billing("cancel")}>{busy === "cancel" ? "Cancelling…" : "Cancel Stay Alive"}</button>
          )}
          <a className="btn btn-line btn-sm" href={setup?.portal} target="_blank" rel="noopener noreferrer">Receipts and card</a>
        </div>
      )}
      {err && <p className="alert" role="alert">{err}</p>}
      <PlanRows user={user} />
    </Panel>
  );
}

// One titled block. Everything in the dashboard sits in these.
function Panel({ title, desc, action, children, id }) {
  return (
    <section className="panel" id={id} aria-label={title}>
      <header className="panel-head">
        <div>
          <h2>{title}</h2>
          {desc && <p>{desc}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function FirstCheck() {
  return (
    <div className="empty">
      <p>Plans show after your first free check. Stamp any page and the result shows the plans that fit it.</p>
      <a className="btn btn-dark btn-sm" href="/#top">Stamp a page</a>
    </div>
  );
}

// A section a plan unlocks, before it's on.
function Locked({ plan, title, lines }) {
  const p = PLANS[plan];
  const priced = hasChecked();
  return (
    <Panel title={title} desc={priced ? `Part of ${p.name}, ${p.price} ${p.per}.` : `Part of ${p.name}. Plans show after your first free check.`}>
      <ul className="locked-list">{lines.map((l) => <li key={l}><Icon name="check" size={15} />{l}</li>)}</ul>
      <div className="row-actions">
        {priced ? (
          <>
            <a className="btn btn-dark" href={planHref(plan)}>{p.cta}</a>
            <a className="btn btn-line" href="/pricing">Compare plans</a>
          </>
        ) : (
          <a className="btn btn-dark" href="/#top">Stamp a page first</a>
        )}
      </div>
    </Panel>
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

// What Stay Alive costs for a number of sites: the plan covers one, each extra one is $5 a month ($50 a year).
function siteMath(n, yearly) {
  const base = yearly ? 200 : 20, each = yearly ? 50 : 5, per = yearly ? "a year" : "a month";
  const extra = Math.max(0, n - 1);
  return { total: base + extra * each, line: extra ? `$${base} + ${extra} × $${each} = $${base + extra * each} ${per}` : `$${base} ${per}`, each: `$${each} ${per}` };
}

// Stay Alive: the sites on the account, then the monitoring of the one picked.
function StayAlive({ user, monitors, onChange }) {
  const sites = monitors || [];
  const [pick, setPick] = useState(0);
  const m = sites[Math.min(pick, sites.length - 1)];
  return (
    <>
      <Sites user={user} sites={sites} pick={pick} setPick={setPick} onChange={onChange} />
      {m && <SiteMonitor monitor={m} />}
    </>
  );
}

function Sites({ user, sites, pick, setPick, onChange }) {
  const sa = user.stayAlive;
  const yearly = sa.interval === "year";
  const seats = Math.max(1, sa.seats || 1);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const math = siteMath(seats, yearly);
  const free = seats - sites.length;
  async function run(key, fn) {
    setBusy(key);
    setErr("");
    try {
      onChange(await fn());
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy("");
    }
  }
  const add = (e) => {
    e.preventDefault();
    const url = new FormData(e.currentTarget).get("url");
    const form = e.currentTarget;
    run("add", async () => {
      const out = await api("site", { action: "add", url });
      form.reset();
      setPick(sites.length);
      return out;
    });
  };
  const remove = (url) => confirm(`Stop watching ${url}? Its history is deleted. The slot stays paid for until you lower the count.`) && run("rm" + url, () => api("site", { action: "remove", url }));
  const slot = (n) => {
    const next = siteMath(n, yearly);
    const msg = n > seats ? `Add a site slot? Stay Alive becomes ${next.line}. You're charged the difference for the rest of this period now.` : `Remove an empty slot? Stay Alive becomes ${next.line}, with a credit for the rest of this period.`;
    if (confirm(msg)) run("seats", () => api("seats", { seats: n }));
  };
  if (!sites.length) {
    return (
      <section className="panel" aria-labelledby="sa-h">
        <div className="panel-head"><div><h2 id="sa-h"><Icon name="activity" /> Stay Alive monitoring</h2><p>Your plan covers one site. Add more later for {math.each} each.</p></div></div>
        <PageForm plan="stayAlive" label="Which page should we watch?" onDone={onChange} />
      </section>
    );
  }
  return (
    <section className="panel" aria-labelledby="sa-h">
      <div className="panel-head">
        <div>
          <h2 id="sa-h"><Icon name="activity" /> Your sites</h2>
          <p>{sites.length} of {seats} {seats === 1 ? "site" : "sites"} in use · {math.line}</p>
        </div>
      </div>
      <ul className="site-list">
        {sites.map((s, i) => {
          const last = s.checks?.at(-1);
          const state = s.paused ? ["", "Paused"] : !s.checks ? ["run", "Starting"] : last?.ok === false ? ["bad", "Down"] : ["ok", "Up"];
          return (
            <li key={s.url} className={i === pick ? "on" : ""}>
              <button type="button" className="site-pick" onClick={() => setPick(i)} aria-pressed={i === pick}>
                <span className={"dot " + state[0]}></span>
                <span className="site-url">{s.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
                <span className="site-state">{state[1]}{i === 0 ? " · in plan" : ""}</span>
              </button>
              <button type="button" className="link danger" disabled={!!busy} onClick={() => remove(s.url)}>{busy === "rm" + s.url ? "Removing…" : "Remove"}</button>
            </li>
          );
        })}
      </ul>
      {free > 0 ? (
        <form className="inline-form" onSubmit={add}>
          <label>Add a site <span className="opt">{free} {free === 1 ? "slot" : "slots"} free</span><input name="url" type="text" inputMode="url" placeholder="https://anothersite.com" required /></label>
          <button className="btn btn-dark" type="submit" disabled={!!busy}>{busy === "add" ? "Adding…" : "Start watching"}</button>
        </form>
      ) : (
        <div className="slot-row">
          <div>
            <b>Watch another site</b>
            <p>{math.each} each. With one more: {siteMath(seats + 1, yearly).line}.</p>
          </div>
          <button type="button" className="btn btn-dark btn-sm" disabled={!!busy} onClick={() => slot(seats + 1)}>{busy === "seats" ? "Adding…" : "Add a site slot"}</button>
        </div>
      )}
      {free > 0 && seats > 1 && <button type="button" className="link quiet" disabled={!!busy} onClick={() => slot(seats - 1)}>Remove an empty slot</button>}
      <p className="fine">Every site gets daily uptime and speed checks, a weekly re-stamp, and change alerts. The app review stays one a month in total: you pick the site in App review.</p>
      {err && <p className="alert" role="alert">{err}</p>}
    </section>
  );
}

function SiteMonitor({ monitor }) {
  const checks = monitor?.checks || [];
  const last = checks[checks.length - 1];
  const up = checks.length ? Math.round((checks.filter((c) => c.ok).length / checks.length) * 1000) / 10 : null;
  const avg = checks.filter((c) => c.ok).length ? Math.round(checks.filter((c) => c.ok).reduce((a, c) => a + c.ms, 0) / checks.filter((c) => c.ok).length) : null;
  const restamps = [...(monitor?.restamps || [])].reverse();
  const next = monitor?.lastRestampAt ? new Date(new Date(monitor.lastRestampAt).getTime() + 7 * 86400000).toISOString() : "";
  const maxMs = Math.max(1, ...checks.slice(-30).map((c) => c.ms || 0));
  const ready = !!monitor.checks;
  return (
    <section className="panel" aria-labelledby="sm-h">
      <div className="panel-head">
        <div>
          <h2 id="sm-h">Monitoring</h2>
          <p>Watching <a href={monitor.url} target="_blank" rel="noopener noreferrer">{monitor.url}</a></p>
        </div>
      </div>
      {monitor.paused && <p className="note">Paused: you have more sites than site slots. Add a slot or remove a site to watch it again.</p>}
      {!monitor.paused && !ready && <Working text="Switching monitoring on: first uptime check and re-stamp are running." />}
      {ready && (
        <>
          <dl className="scout">
            <div><dt>Right now</dt><dd className={last?.ok ? "ok" : "bad"}>{last ? (last.ok ? `Up · ${last.status}` : `Down · ${last.status || last.error}`) : "Checking…"}</dd></div>
            <div><dt>Uptime</dt><dd>{up != null ? `${up}%` : "Not yet"} <small>last {checks.length} checks</small></dd></div>
            <div><dt>Server answers in</dt><dd>{avg != null ? `${avg} ms` : "Not yet"} <small>average</small></dd></div>
            <div><dt>Last check</dt><dd>{fmtTime(monitor.lastCheckAt)}</dd></div>
            <div><dt>Next re-stamp</dt><dd>{monitor.restampRunning ? "Running now" : next ? fmtDate(next) : "Soon"}</dd></div>
          </dl>
          {checks.length > 1 && (
            <div className="spark" aria-label="Response time, last 30 checks">
              {checks.slice(-30).map((c) => <span key={c.at} className={c.ok ? "" : "down"} title={`${fmtTime(c.at)}: ${c.ok ? `${c.ms} ms` : "down"}`} style={{ height: `${c.ok ? Math.max(8, (c.ms / maxMs) * 100) : 100}%` }}></span>)}
            </div>
          )}
          {monitor.restampRunning && <Working text="Re-stamping your page now." />}
          <h3>Changes spotted</h3>
          {monitor.changes?.length ? (
            <ul className="changes">
              {monitor.changes.map((c) => (
                <li key={c.at}>
                  <time>{fmtDate(c.at)}</time>
                  <div>
                    {c.verdict && <p><b>Stamp:</b> {c.verdict.from} to {c.verdict.to}</p>}
                    {c.lcp && <p><b>Speed:</b> main content in {(c.lcp.to / 1000).toFixed(1)}s, was {(c.lcp.from / 1000).toFixed(1)}s</p>}
                    {c.added.map((t) => <p key={"a" + t} className="add">+ {t}</p>)}
                    {c.removed.map((t) => <p key={"r" + t} className="rem">− {t}</p>)}
                    {c.stampId && <a href={`/v/${c.stampId}`}>See that stamp</a>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="fine">Nothing changed yet. Each weekly re-stamp is compared with the last one: tools and tracking pixels added or removed, speed, and the verdict. You get an email when something changes.</p>
          )}
          <h3>Weekly re-stamps</h3>
          {restamps.length ? (
            <ul className="history">
              {restamps.map((r) =>
                r.failed ? (
                  <li key={r.at}><span className="v-chip">FAIL</span><span>Couldn't stamp: {r.failed}</span><time>{fmtDate(r.at)}</time></li>
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
  // A Stay Alive review covers one site a month, so with several sites the member picks one.
  const saSites = user.stayAlive?.sites || [];
  const pickSite = !(user.reviewsLeft?.killSheet > 0) && user.stayAliveActive && saSites.length > 1;
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
        <p>{user.member ? (left ? "Included with your membership. A person tests it end to end, and the result comes back here." : "Your included review is in. Stay Alive members get a new one every month.") : "Included with the Kill Sheet and Stay Alive."}</p>
      </div>
      <ol className="how">{REVIEW_STEPS.map((x) => <li key={x}>{x}</li>)}</ol>

      {user.member && left > 0 && (
        <form className="review-form" onSubmit={submit}>
          <div className="row2">
            {pickSite ? (
              <label>Which site gets this month's review
                <select name="siteUrl" defaultValue={saSites[0]}>{saSites.map((s) => <option key={s} value={s}>{s.replace(/^https?:\/\//, "")}</option>)}</select>
              </label>
            ) : (
              <label>Site URL<input name="siteUrl" type="text" inputMode="url" placeholder="https://yourapp.com" defaultValue={user.killSheet?.url || user.stayAlive?.url || ""} /></label>
            )}
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
      {!user.member && hasChecked(user) && (
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

function StampTable({ stamps }) {
  return (
    <div className="tbl" role="table" aria-label="Stamps">
      <div className="tr th" role="row"><span role="columnheader">Site</span><span role="columnheader">Verdict</span><span role="columnheader">Score</span><span role="columnheader">Date</span></div>
      {stamps.map((s) => (
        <a key={s.id} className="tr" role="row" href={`/v/${s.id}`}>
          <span className="site" role="cell">{s.icon ? <img src={s.icon} alt="" width="18" height="18" /> : <i>{s.host[0].toUpperCase()}</i>}{s.host}</span>
          <span role="cell"><b className={"v-chip v-" + s.verdict.toLowerCase()}>{s.verdict}</b></span>
          <span role="cell" className="num">{s.score ?? "n/a"}</span>
          <span role="cell" className="muted">{fmtDate(s.at)}</span>
        </a>
      ))}
    </div>
  );
}


function StampDetail({ stamp, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    fetch(`/api/verdict?id=${encodeURIComponent(stamp.id)}`, { cache: "no-store" })
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => { if (live) { if (!ok) setErr(b.error || "Could not load this stamp."); else setData(b); } })
      .catch(() => live && setErr("Could not load this stamp."));
    return () => { live = false; };
  }, [stamp.id]);
  const rows = data?.snapshot ? snapshotRows(data.snapshot) : [];
  const checks = Array.isArray(data?.checks) ? data.checks : [];
  return (
    <section className="panel detail-panel" aria-label={`Details for ${stamp.host}`}>
      <header className="panel-head">
        <div><h2>{stamp.host}</h2><p>{stamp.verdict}{stamp.score != null ? ` · ${stamp.score} / 100` : ""} · {fmtDate(stamp.at)}</p></div>
        <button type="button" className="btn btn-line btn-sm" onClick={onClose}>Close</button>
      </header>
      {err && <p className="alert" role="alert">{err}</p>}
      {!data && !err && <p className="muted">Loading details…</p>}
      {data && data.locked && <p className="note">Full details live on the result page. <a href={`/v/${stamp.id}`}>Open the result</a>.</p>}
      {rows.length > 0 && (
        <>
          <h3>Tech stack and speed</h3>
          <div className="kv">{rows.map((r) => (<div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>))}</div>
        </>
      )}
      {checks.length > 0 && (
        <>
          <h3>Checks</h3>
          <ul className="status-list">{checks.map((c) => (
            <li key={c.id || c.label}><span className={"dot " + (c.pass ? "ok" : c.skip ? "" : "bad")} /><div><b>{c.label}</b><p>{c.detail || (c.pass ? "Passed" : "Failed")}</p></div></li>
          ))}</ul>
        </>
      )}
      {data && <div className="row-actions"><a className="btn btn-dark btn-sm" href={`/v/${stamp.id}`}>Open full result</a><Copy text={`${location.origin}/v/${stamp.id}`} label="Copy link" done="Link copied" /></div>}
    </section>
  );
}

function MyCards({ user }) {
  const stamps = user.stamps || [];
  return (
    <Panel title="My cards" desc="Your status badges to copy into a footer, and every stamp's link to share. ALIVE stamps earn a badge; other stamps show their result link until they climb to 80.">
      {stamps.length ? (
        <div className="stamp-cards">
          {stamps.map((s) => {
            const tier = s.verdict === "ALIVE" ? tierFor(s.verdict, s.score) : null;
            return (
              <article key={s.id} className="stamp-card">
                <p className="stamp-card-host">{s.icon ? <img src={s.icon} alt="" width="18" height="18" /> : null}{s.host}</p>
                <p><b className={"v-chip v-" + s.verdict.toLowerCase()}>{s.verdict}</b>{s.score != null && <span className="num"> {s.score} / 100</span>}{tier && <span className="muted"> · {tier.name}</span>}</p>
                {tier && <img className="stamp-card-badge" src={svgUri(embedSvg({ tier, score: s.score, theme: "steel" }))} alt={`${tier.name}, alive on Stamp My Page`} width="300" height="64" />}
                <div className="row-actions">
                  {tier && <><Copy text={badgeEmbed(s, "steel")} label="Copy steel badge" /><Copy text={badgeEmbed(s, "dark")} label="Copy dark badge" /></>}
                  <Copy text={`${location.origin}/v/${s.id}`} label="Copy link" done="Link copied" />
                  <a className="btn btn-line btn-sm" href={`/v/${s.id}`}>Open result</a>
                </div>
              </article>
            );
          })}
        </div>
      ) : <Empty text="No stamps yet. Stamp a page and your cards show up here." action={<a className="btn btn-dark btn-sm" href="/#top">Stamp your first page</a>} />}
    </Panel>
  );
}

function Stamps({ user }) {
  const stamps = user.stamps || [];
  const [picked, setPicked] = useState(null);
  return (
    <>
      <Panel title="Stamps" desc="Every stamp saved to your account, newest first. Stamps you make while signed in are saved automatically. Tap Details on any stamp for its tech stack, speed, and security." action={<a className="btn btn-dark btn-sm" href="/#top">Stamp a page</a>}>
        {stamps.length ? (
          <div className="tbl" role="table" aria-label="Stamps">
            <div className="tr th" role="row"><span role="columnheader">Site</span><span role="columnheader">Verdict</span><span role="columnheader">Score</span><span role="columnheader">Date</span><span role="columnheader" /></div>
            {stamps.map((s) => (
              <div key={s.id} className="tr" role="row">
                <a className="site" role="cell" href={`/v/${s.id}`}>{s.icon ? <img src={s.icon} alt="" width="18" height="18" /> : <i>{s.host[0].toUpperCase()}</i>}{s.host}</a>
                <span role="cell"><b className={"v-chip v-" + s.verdict.toLowerCase()}>{s.verdict}</b></span>
                <span role="cell" className="num">{s.score ?? "n/a"}</span>
                <span role="cell" className="muted">{fmtDate(s.at)}</span>
                <span role="cell"><button type="button" className="btn btn-line btn-sm" onClick={() => setPicked(s)}>Details</button></span>
              </div>
            ))}
          </div>
        ) : <Empty text="No stamps yet." action={<a className="btn btn-dark btn-sm" href="/#top">Stamp your first page</a>} />}
      </Panel>
      {picked && <StampDetail stamp={picked} onClose={() => setPicked(null)} />}
    </>
  );
}

function Empty({ text, action }) {
  return <div className="empty"><p>{text}</p>{action}</div>;
}

// The first thing you see: the numbers, recent stamps, and what your plan is doing.
function Overview({ user, report, monitor, go }) {
  const stamps = user.stamps || [];
  const latest = stamps[0];
  const best = stamps.reduce((m, s) => (s.score != null && s.score > (m?.score ?? -1) ? s : m), null);
  const checks = monitor?.checks || [];
  const up = checks.length ? Math.round((checks.filter((c) => c.ok).length / checks.length) * 1000) / 10 : null;
  return (
    <>
      <div className="kpis">
        <div><p>Stamps saved</p><b>{stamps.length}</b></div>
        <div><p>Latest</p><b className={latest ? "v-" + latest.verdict.toLowerCase() : ""}>{latest ? `${latest.verdict} ${latest.score ?? ""}` : "None yet"}</b><small>{latest?.host || ""}</small></div>
        <div><p>Best score</p><b>{best ? best.score : "None yet"}</b><small>{best?.host || ""}</small></div>
        <div><p>Plan</p><b>{user.killSheetActive && user.stayAliveActive ? "Both plans" : user.killSheetActive ? "Kill Sheet" : user.stayAliveActive ? "Stay Alive" : "Free"}</b><small>{user.stayAliveActive && up != null ? `${up}% uptime` : user.stayAliveActive ? "Monitoring on" : user.killSheetActive ? (report?.status === "ready" ? "Sheet ready" : "Sheet running") : ""}</small></div>
      </div>

      <div className="grid2">
        <Panel title="Recent stamps" action={stamps.length > 5 ? <button type="button" className="link" onClick={() => go("stamps")}>View all</button> : null}>
          {stamps.length ? <StampTable stamps={stamps.slice(0, 5)} /> : <Empty text="Stamp a page and it shows up here." action={<a className="btn btn-dark btn-sm" href="/#top">Stamp a page</a>} />}
        </Panel>
        {user.member ? (
          <Panel title="Your plan">
            <ul className="status-list">
              {user.killSheetActive && (
                <li>
                  <span className={"dot " + (report?.status === "ready" ? "ok" : report?.status === "failed" ? "bad" : "run")}></span>
                  <div><b>Kill Sheet</b><p>{report?.status === "ready" ? `Ready for ${new URL(report.url).hostname}` : report?.status === "failed" ? "Needs another try" : user.killSheet.url ? "Running now" : "Add your page to start"}</p></div>
                  <button type="button" className="link" onClick={() => go("kill-sheet")}>Open</button>
                </li>
              )}
              {user.stayAliveActive && (
                <li>
                  <span className={"dot " + (checks.at(-1)?.ok === false ? "bad" : monitor ? "ok" : "run")}></span>
                  <div><b>Monitoring{(user.stayAlive.sites || []).length > 1 ? ` · ${user.stayAlive.sites.length} sites` : ""}</b><p>{monitor ? `${checks.at(-1)?.ok === false ? "Down at last check" : "Up"} · next billing ${fmtDate(user.stayAlive.renews)}` : user.stayAlive.url ? "Switching on" : "Add your page to start"}</p></div>
                  <button type="button" className="link" onClick={() => go("monitoring")}>Open</button>
                </li>
              )}
              <li>
                <span className={"dot " + (user.reviewsLeft?.total ? "ok" : "idle")}></span>
                <div><b>App review</b><p>{user.reviewsLeft?.total ? "1 review available" : (user.reviews || []).length ? `${user.reviews.length} sent` : "None available"}</p></div>
                <button type="button" className="link" onClick={() => go("reviews")}>Open</button>
              </li>
            </ul>
            <PlanRows user={user} />
          </Panel>
        ) : (
          <Panel title="Upgrade" desc="Fixes, monitoring, and a human review. Delivered here the moment you pay.">
            <PlanRows user={user} />
          </Panel>
        )}
      </div>
{latest && latest.verdict === "ALIVE" && (() => { const tier = tierFor(latest.verdict, latest.score); return (
        <Panel title="Your status badge" desc={`Your latest stamp, ${latest.host}, earned ${tier.name}. Copy a badge into your footer, it links back to that stamp.`} action={<button type="button" className="link" onClick={() => go("cards")}>All my cards</button>}>
          <img className="stamp-card-badge" src={svgUri(embedSvg({ tier, score: latest.score, theme: "steel" }))} alt={`${tier.name}, alive on Stamp My Page`} width="300" height="64" />
          <div className="row-actions"><Copy text={badgeEmbed(latest, "steel")} label="Copy steel badge" /><Copy text={badgeEmbed(latest, "dark")} label="Copy dark badge" /></div>
        </Panel>
      ); })()}
    </>
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
    <Panel title="Sign-in" desc={`Signed in as ${user.email}${user.x?.username ? `, linked to X @${user.x.username}` : ""}.`}>
      <form className="inline-form" onSubmit={setPassword}>
        <label>{user.hasPassword ? "Change password" : "Set a password"}<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
        <button className="btn btn-line" type="submit">Save</button>
      </form>
      {msg && <p className={msg.bad ? "alert" : "note"}>{msg.text}</p>}
      <div className="danger-row">
        <div><b>Delete account</b><p>Removes your account, saved stamps list, reports, and any stored test logins.</p></div>
        <button type="button" className="btn btn-line btn-sm danger" onClick={del}>Delete</button>
      </div>
    </Panel>
  );
}

// Right after paying: what's on, what's already running, and where to go next. Shown once, when the plan switches on.
function Welcome({ plan, user, go, onClose }) {
  const ks = plan === "killSheet";
  const page = ks ? user.killSheet?.url : user.stayAlive?.url;
  const host = page ? page.replace(/^https?:\/\//, "").replace(/\/$/, "") : "";
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const esc = (e) => e.key === "Escape" && onClose();
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onClose]);
  const steps = ks
    ? [
        ["done", "Kill Sheet is on", "Payment confirmed. It's yours to keep, nothing renews."],
        page ? ["run", `Scouting ${host}`, "The whole page, your headline, subhead and button rewritten, and 3 to 5 ranked fixes. Ready in about a minute."] : ["todo", "Add your page", "Tell us which page to scout and the Kill Sheet starts right away."],
        ["todo", "One app review, included", "Send your site or app whenever you're ready. A person tests it end to end."],
        ["todo", "One free re-stamp", "Ship the fixes, then re-stamp to see the new score."],
      ]
    : [
        ["done", "Stay Alive is on", "Payment confirmed. Cancel anytime from your dashboard."],
        page ? ["run", `Watching ${host}`, "The first uptime check and re-stamp are running now. After that: daily checks and a fresh stamp every week."] : ["todo", "Add the page to watch", "Monitoring starts the moment you add it."],
        ["todo", "Alerts by email", "When the page goes down, or its stack, speed, or tracking pixels change."],
        ["todo", "One app review a month", "For the site you pick. More sites can be added from Monitoring."],
      ];
  const open = (id) => {
    onClose();
    go(id);
  };
  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-h">
      <div className="welcome-scrim" onClick={onClose}></div>
      <div className="welcome-card" ref={ref} tabIndex={-1}>
        <span className="welcome-badge"><Icon name="check" size={26} /></span>
        <p className="eyebrow">Payment confirmed</p>
        <h2 id="welcome-h">Welcome to {ks ? "the Kill Sheet" : "Stay Alive"}</h2>
        <p className="welcome-sub">Everything is in this dashboard. Your receipt comes by email from our payment provider.</p>
        <ol className="welcome-steps">
          {steps.map(([state, title, text]) => (
            <li key={title} className={state}>
              <span className="welcome-dot" aria-hidden="true">{state === "done" ? <Icon name="check" size={14} /> : state === "run" ? <span className="spin"></span> : null}</span>
              <div>
                <b>{title}</b>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="welcome-actions">
          <button type="button" className="btn btn-dark" onClick={() => open(ks ? "kill-sheet" : "monitoring")}>{ks ? (page ? "See my Kill Sheet" : "Add my page") : page ? "Open Monitoring" : "Add my page"} <Icon name="arrow-right" /></button>
          <button type="button" className="btn btn-line" onClick={() => open("reviews")}>Send an app review</button>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ data, setData, onOut }) {
  const { user, report, monitor, monitors, setup } = data;
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
    api("checkout", { plan: PLAN, url: params.get("url") || "", billing: YEARLY ? "yearly" : "" })
      .then((out) => {
        track("checkout_start", { plan: PLAN, billing: YEARLY ? "yearly" : "monthly" });
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
  const running = banner === "confirming" || report?.status === "working" || (monitors || []).some((m) => m.restampRunning || (!m.checks && !m.paused)) || (user.stayAliveActive && user.stayAlive?.url && !monitor);
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => {
      tries.current++;
      if (banner === "confirming" && tries.current > 90) setBanner("slow");
      refresh();
    }, banner === "confirming" ? 1500 : 3000);
    return () => clearTimeout(t);
  }, [running, data, banner, refresh]);

  // Free stamps from this browser: saved as soon as you're in. Came from a result page? Back to it.
  // A ?save= stamp id is saved too, so a visitor who opens the result in another browser can
  // still save it, not only the browser that made it. First saver still wins on the server.
  // A ?claim= stamp id is a manual site claim, separate from saving: it sets the Owned by card,
  // and only a Claim this site press sends it, never an automatic save.
  useEffect(() => {
    const j = jobs();
    const saveId = params.get("save") || "";
    const ids = /^[A-Za-z0-9_-]{6,40}$/.test(saveId) ? [saveId] : [];
    const claimId = params.get("claim") || "";
    const claimIds = /^[A-Za-z0-9_-]{6,40}$/.test(claimId) ? [claimId] : [];
    const back = params.get("back") || "";
    const done = () => /^\/v\/[A-Za-z0-9_-]{6,40}$/.test(back) && !PLAN && location.replace(`${back}?signedin=1`);
    const run = async () => {
      if (j.length || ids.length) {
        const out = await api("claim", { jobs: j, ids }).catch(() => ({}));
        forgetJobs(j);
        if (out.saved && out.user) setData((d) => ({ ...d, ...out }));
      }
      if (claimIds.length) await api("claim-site", { id: claimIds[0] }).catch(() => ({}));
    };
    if (j.length || ids.length || claimIds.length) run().finally(done);
    else done();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = (out) => out?.user !== undefined && setData((d) => ({ ...d, ...out }));

  // Sections live in the URL hash, so back and forward work and links can point at one.
  const first = PAID === "killSheet" ? "kill-sheet" : PAID === "stayAlive" ? "monitoring" : "overview";
  const [sect, setSect] = useState(() => (SECTIONS.some((x) => x.id === location.hash.slice(1)) ? location.hash.slice(1) : first));
  useEffect(() => {
    const on = () => SECTIONS.some((x) => x.id === location.hash.slice(1)) && setSect(location.hash.slice(1));
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  const go = (id) => {
    history.replaceState(null, "", `${location.pathname}${location.search}#${id}`);
    setSect(id);
    scrollTo({ top: 0 });
  };
  const counts = { stamps: (user.stamps || []).length, reviews: (user.reviews || []).filter((r) => r.status !== "delivered").length };
  const locked = { "kill-sheet": !user.killSheetActive, monitoring: !user.stayAliveActive };
  const here = SECTIONS.find((x) => x.id === sect);

  return (
    <div className="app wrap">
      <aside className="side" aria-label="Dashboard">
        <a className="btn btn-dark side-cta" href="/#top"><Icon name="arrow-right" /> Stamp a page</a>
        <nav className="side-nav">
          {SECTIONS.map((x) => (
            <button key={x.id} type="button" className={sect === x.id ? "on" : ""} aria-current={sect === x.id ? "page" : undefined} onClick={() => go(x.id)}>
              <Icon name={x.icon} size={16} />
              <span>{x.label}</span>
              {locked[x.id] ? <Icon name="lock" size={13} className="side-lock" /> : counts[x.id] ? <em>{counts[x.id]}</em> : null}
            </button>
          ))}
        </nav>
        <div className="side-plan">
          <p>{user.member ? "Member" : "Free plan"}</p>
          <b>{[user.killSheetActive && "Kill Sheet", user.stayAliveActive && "Stay Alive"].filter(Boolean).join(" + ") || "Stamps and full details"}</b>
          {!user.stayAliveActive && <a href={planHref(user.killSheetActive ? "stayAlive" : "killSheet")}>{user.killSheetActive ? "Add Stay Alive" : "Upgrade"}</a>}
        </div>
      </aside>

      <main className="main">
        {banner === "checkout" && <div className="banner"><Working text={`Taking you to secure checkout for ${PLAN_NAME}, with ${user.email} filled in…`} /></div>}
        {banner === "confirming" && <div className="banner"><Working text="Payment received. Switching your membership on…" /></div>}
        {banner === "slow" && <div className="banner warn">Your payment hasn't been confirmed to us yet. This page keeps checking; if it takes more than a few minutes, write to {DESK.contact} with your receipt.</div>}
        {banner === "active" && <Welcome plan={PAID} user={user} go={go} onClose={() => setBanner("")} />}
        {params.get("confirmed") && !banner && <Toast text="Email confirmed. You're signed in." />}
        {err && <p className="alert" role="alert">{err}</p>}

        <div className="page-head">
          <h1>{here.label}</h1>
          <p>{here.desc}</p>
        </div>

        {sect === "overview" && <Overview user={user} report={report} monitor={monitor} go={go} />}
        {sect === "stamps" && <Stamps user={user} />}
        {sect === "cards" && <MyCards user={user} />}
        {sect === "kill-sheet" && (user.killSheetActive ? <KillSheet user={user} report={report} onChange={onChange} /> : <Locked plan="killSheet" title="Kill Sheet" lines={["A scout of your whole page, not just the first screen", "Your headline, subhead, and button rewritten", "3 to 5 fixes ranked by impact, and a free re-stamp", "One app review"]} />)}
        {sect === "monitoring" && (user.stayAliveActive ? <StayAlive user={user} monitors={monitors} onChange={onChange} /> : <Locked plan="stayAlive" title="Monitoring" lines={["A fresh stamp every week, with the score over time", "Daily uptime checks and an alert when it goes down", "Alerts when your stack, speed, or a tracking pixel changes", "Watch more sites, added from your dashboard", "One app review a month"]} />)}
        {sect === "reviews" && <Reviews user={user} onChange={onChange} />}
        {sect === "account" && (
          <>
            <Billing user={user} setup={setup} onChange={onChange} />
            <Settings user={user} onOut={onOut} />
          </>
        )}
      </main>
    </div>
  );
}

const SECTIONS = [
  { id: "overview", label: "Overview", icon: "gauge", desc: "Your stamps and plan at a glance." },
  { id: "stamps", label: "Stamps", icon: "list-checks", desc: "Every page you've stamped, with the full checks, stack, and speed behind each." },
  { id: "cards", label: "My cards", icon: "image", desc: "Your status badges to copy into a footer, and every stamp's link to share." },
  { id: "kill-sheet", label: "Kill Sheet", icon: "clipboard-list", desc: "The whole page scouted, your copy rewritten, and the fixes ranked." },
  { id: "monitoring", label: "Monitoring", icon: "activity", desc: "Uptime, speed, weekly re-stamps, and what changed." },
  { id: "reviews", label: "App review", icon: "search", desc: "A person tests your app end to end. The result lands here." },
  { id: "account", label: "Account", icon: "user", desc: "Plan, billing, and sign-in." },
];

function App() {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");
  useEffect(() => {
    trackView("dashboard");
    fetch("/api/account", { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (hasChecked(body.user)) markChecked();
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
