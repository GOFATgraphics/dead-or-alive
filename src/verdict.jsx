import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./result.css";
import { BoxCat } from "./ui.jsx";
import { Icon } from "./icons.jsx";
import { track, trackView } from "./track.js";
import { markChecked } from "./checked.js";
import { DESK } from "./config.js";
import { Toast } from "./toast.jsx";
import { plansHtml, reviewHtml } from "./plans.js";
import "./plans.css";
import { Checks, Hero, Share, Snapshot, Status } from "./stamp-parts.jsx";

// Back from signing in (email, password, or X) on this stamp's save button.
const justSignedIn = new URLSearchParams(location.search).get("signedin") === "1";

// The closing line, by verdict.
const NEXT = {
  DEAD: "It can come back.",
  COPE: "Close. Not clear yet.",
  ALIVE: "Keep it that way.",
};

function resultId() {
  const fromPath = location.pathname.split("/").filter(Boolean)[1];
  return fromPath || new URLSearchParams(location.search).get("id") || "";
}

function Bar() {
  return (
    <header className="bar">
      <a className="mark" href="/" aria-label="Stamp My Page home">
        <img src="/brand/smp-mark.svg" alt="" width="26" height="26" />
        <span>Stamp My Page</span>
      </a>
      <a className="bar-signin" href="/dashboard">Dashboard</a>
      <a className="btn btn-line btn-sm bar-stamp" href="/#top">Stamp another page</a>
    </header>
  );
}

function Foot() {
  return (
    <footer className="foot">
      <a className="mark" href="/"><img src="/brand/smp-mark.svg" alt="" width="22" height="22" /><span>Stamp My Page</span></a>
      <nav aria-label="Footer"><a href="/pricing">Pricing</a><a href="/dashboard">Dashboard</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href={`mailto:${DESK.contact}`}>{DESK.contact}</a></nav>
      <span className="foot-meta">© Gofat Labs</span>
    </footer>
  );
}

function Notice({ cat, title, text, link }) {
  return (
    <div className="page">
      <Bar />
      <main className="notice">
        <div className="notice-card">
          <BoxCat state={cat} />
          <h1>{title}</h1>
          {text && <p>{text}</p>}
          {link}
        </div>
      </main>
    </div>
  );
}

const Loading = () => <Notice cat="looking" title="Opening the stamp…" />;
const Missing = () => (
  <Notice cat="closed" title="No stamp here." text="This link is wrong or the stamp was taken down." link={<a className="btn btn-red" href="/#top">Stamp your page free <Icon name="arrow-right" /></a>} />
);

// Saving the result: a free account, no card. Signed in already? The stamp is saved to the dashboard on the spot.
function localJobs() {
  try {
    return JSON.parse(localStorage.getItem("smp.jobs") || "[]");
  } catch (_) {
    return [];
  }
}

// Who's looking: signed out, a free account, or a member. Signed in, this browser's free stamps are saved to the
// account on the spot. A stamp of one of a member's own pages (a Stay Alive or Kill Sheet re-stamp) counts as theirs.
function useAccount(r) {
  const [acct, setAcct] = useState({ status: "loading" });
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/account", { cache: "no-store" });
        if (!res.ok) return live && setAcct({ status: "off" });
        const data = await res.json();
        if (!data.user) return live && setAcct({ status: "out" });
        let user = data.user;
        const jobs = localJobs();
        if (!(user.stamps || []).some((x) => x.id === r.id) && jobs.length) {
          const c = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "claim", jobs }) }).then((x) => x.json()).catch(() => ({}));
          if (c.user) {
            user = c.user;
            try {
              localStorage.removeItem("smp.jobs");
            } catch (_) {}
          }
        }
        const host = (u) => {
          try {
            return new URL(u).hostname.replace(/^www\./, "");
          } catch (_) {
            return "";
          }
        };
        const own = [...(user.stayAlive?.sites || []), user.stayAlive?.url, user.killSheet?.url].filter(Boolean).map(host);
        const saved = (user.stamps || []).some((x) => x.id === r.id);
        const mine = saved || (user.member && own.includes(host(r.pageUrl)));
        if (live) setAcct({ status: "in", user, saved, mine });
      } catch (_) {
        if (live) setAcct({ status: "off" });
      }
    })();
    return () => {
      live = false;
    };
  }, [r.id]);
  return acct;
}

function SavePrompt({ r, acct }) {
  const state = acct;
  if (state.status === "loading" || state.status === "off") return null;
  const next = `/dashboard?save=${encodeURIComponent(r.id)}&back=${encodeURIComponent(`/v/${r.id}`)}`;
  return (
    <section className="wrap save-wrap" aria-labelledby="save-h">
      <div className="save">
        <span className="ic-tile"><Icon name={state.status === "in" ? "check" : "user"} size={20} /></span>
        {state.status === "out" ? (
          <>
            <div>
              <h2 id="save-h">Create a free account to save it.</h2>
              <p>Keep this stamp, see all your stamps in one place, and get a free re-stamp after you fix it. No card.</p>
            </div>
            <div className="save-actions">
              <a className="btn btn-dark" href={next} onClick={() => track("save_click", { v: r.verdict })}>Save it free</a>
            </div>
          </>
        ) : (
          <>
            <div>
              <h2 id="save-h">{state.mine ? (state.saved ? "Saved to your dashboard." : "One of your pages.") : "You're signed in."}</h2>
              <p>{state.mine ? (state.saved ? "Every stamp you make while signed in lands there too." : "This stamp is part of your plan's history in your dashboard.") : "This stamp is saved to another account, or was made in another browser. Stamp the page again to add it to yours."}</p>
            </div>
            <div className="save-actions">
              <a className="btn btn-line" href="/dashboard">Open dashboard <Icon name="arrow-right" /></a>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// The plans, for anyone who isn't a member yet. Members get their plan and the way back to the dashboard instead.
function Offers({ r, acct }) {
  const v = r.verdict;
  if (acct.status === "loading") return null;
  if (acct.user?.member) return <MemberStrip user={acct.user} />;
  // A page in trouble needs fixing first; a page that works needs watching.
  const order = v === "ALIVE" ? ["stayAlive", "killSheet"] : ["killSheet", "stayAlive"];
  const failed = (r.checks || []).filter((k) => !k.pass).length;
  return (
    <section className="sect wrap" id="offers" aria-labelledby="offers-h">
      <div className="sect-head">
        <p className="eyebrow">{v === "ALIVE" ? "Keep it alive" : "Bring it back"}</p>
        <h2 id="offers-h">{v === "ALIVE" ? "Pages break quietly. We'll watch it." : "Fix it yourself, or hand it to us."}</h2>
        <p className="sect-sub">{v === "ALIVE" ? "A deploy, a slow script, a new hero. Stay Alive re-stamps every week and tells you first." : `${failed ? `${failed} thing${failed === 1 ? "" : "s"} to fix. ` : ""}The list above is free. The Kill Sheet is the rewrite and the full-page scout, in your dashboard the moment you pay.`}</p>
      </div>
      {/* Same cards as /pricing, from src/plans.js; clicks on a plan are counted here. */}
      <div
        onClick={(e) => {
          const el = e.target.closest?.("[data-plan]");
          if (el) track("offer_click", { v, plan: el.dataset.plan, billing: el.dataset.billing || "" });
        }}
        dangerouslySetInnerHTML={{ __html: plansHtml({ order, pageUrl: r.pageUrl }) + reviewHtml() }}
      />
    </section>
  );
}

function MemberStrip({ user }) {
  const plans = [user.killSheetActive && "Kill Sheet", user.stayAliveActive && "Stay Alive"].filter(Boolean).join(" and ");
  return (
    <section className="wrap save-wrap" aria-labelledby="member-h">
      <div className="save">
        <span className="ic-tile"><Icon name="check" size={20} /></span>
        <div>
          <h2 id="member-h">You're on {plans}.</h2>
          <p>{user.stayAliveActive ? "Your sites are watched every day and re-stamped every week. The history, alerts, and your app review are in your dashboard." : "Your Kill Sheet, the rewrite, and your app review are in your dashboard."}</p>
        </div>
        <div className="save-actions">
          <a className="btn btn-dark" href={user.stayAliveActive ? "/dashboard#monitoring" : "/dashboard#kill-sheet"}>Open dashboard <Icon name="arrow-right" /></a>
        </div>
      </div>
    </section>
  );
}

function Result({ r }) {
  const v = r.verdict;
  const acct = useAccount(r);
  return (
    <div className="page">
      <Bar />
      <main>
        {justSignedIn && <Toast text="Signed in. This stamp is saved to your dashboard." href="/dashboard" action="Dashboard" />}
        <Hero r={r} />
        <Status r={r} />
        <Checks r={r} />
        {!acct.user?.member && <SavePrompt r={r} acct={acct} />}
        <Offers r={r} acct={acct} />
        <Share r={r} />
        <Snapshot s={r.snapshot} />
        <section className="final" aria-labelledby="final-h">
          <div className="final-in">
            <span className="app-tile"><img src="/brand/smp-mark.svg" alt="" width="32" height="32" /></span>
            <h2 id="final-h"><span className="h-1">{NEXT[v]}</span> <span className="h-2">Stamp the next one.</span></h2>
            <a className="btn btn-red" href="/#top" onClick={() => track("result_cta", { v })}><Icon name="rotate-ccw" /> Stamp another page free</a>
          </div>
        </section>
      </main>
      <Foot />
    </div>
  );
}

function App() {
  const [state, setState] = useState({ status: "loading" });
  useEffect(() => {
    const id = resultId();
    if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) return setState({ status: "missing" });
    fetch(`/api/verdict?id=${encodeURIComponent(id)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((r) => {
        if (!NEXT[r.verdict]) throw new Error("bad verdict");
        document.title = `${r.verdict}: ${r.host} | Stamp My Page`;
        trackView("result", { v: r.verdict });
        markChecked();
        setState({ status: "ready", r });
      })
      .catch(() => setState({ status: "missing" }));
  }, []);
  if (state.status === "loading") return <Loading />;
  if (state.status === "missing") return <Missing />;
  return <Result r={state.r} />;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
