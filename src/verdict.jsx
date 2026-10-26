import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./result.css";
import { BoxCat, reducedMotion } from "./ui.jsx";
import DecryptedText from "./bits/DecryptedText.jsx";
import { Icon } from "./icons.jsx";
import { track, trackView } from "./track.js";
import { snapshotRows } from "./snapshot.js";
import { DESK } from "./config.js";
import { TIERS, embedSvg, svgUri, tickSvg, tierFor } from "./badge.js";

const still = reducedMotion();

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
      <a className="btn btn-line btn-sm" href="/#top">Stamp another page</a>
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

function Copy({ text, label, done = "Copied", className = "btn btn-line btn-sm", onCopy }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    onCopy?.();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (_) {
      prompt("Copy this", text);
    }
  }
  return (
    <button type="button" className={className} onClick={copy} aria-live="polite">
      <Icon name={copied ? "check" : "copy"} /> {copied ? done : label}
    </button>
  );
}

// The verdict, the score, the sentence, and the first screen in a browser frame.
function Hero({ r }) {
  const v = r.verdict;
  const tier = tierFor(v, r.score);
  const when = r.createdAt ? new Date(r.createdAt).toLocaleDateString([], { dateStyle: "medium" }) : "";
  const checks = Array.isArray(r.checks) ? r.checks : [];
  const measured = checks.filter((k) => !k.skip);
  const passed = measured.filter((k) => k.pass).length;
  return (
    <section className={"hero v-" + v.toLowerCase()} aria-labelledby="verdict-h">
      <div className="hero-grid">
        <div className="hero-copy">
          <p className="chip-row">
            <span className="chip">
              We looked at {r.icon && <img className="site-icon" src={r.icon} alt="" width="16" height="16" />}<b>{r.host}</b>
              {tier && <img src={svgUri(tickSvg(tier, 16))} alt={`${tier.name} tier`} width="16" height="16" />}
            </span>
            {when && <span className="chip quiet">{when}</span>}
            {r.number ? <span className="chip quiet">Stamp #{String(r.number).padStart(4, "0")}</span> : null}
          </p>
          <h1 id="verdict-h" className="verdict">
            {still ? v : <DecryptedText text={v} animateOn="view" sequential speed={90} characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ" encryptedClassName="scrambled" />}
          </h1>
          <p className="sentence">“{r.sentence}”</p>
          {r.score >= 0 && (
            <div className="score">
              <p className="score-n"><strong>{r.score}</strong>/100</p>
              <div className="score-meta">
                <div className="score-bar" aria-hidden="true"><span style={{ width: `${r.score}%` }}></span></div>
                <p>{checks.length ? `${passed} of ${measured.length} checks passed` : "First-screen score"}</p>
              </div>
            </div>
          )}
          <div className="hero-actions">
            {v === "ALIVE" ? (
              <a className="btn btn-red" href="#status">See your status <Icon name="arrow-right" /></a>
            ) : (
              <a className="btn btn-red" href="#checks" onClick={() => track("result_cta", { v })}>See what failed <Icon name="arrow-right" /></a>
            )}
            <a className="btn btn-line" href="#share"><Icon name="share-2" /> Share</a>
          </div>
        </div>

        <figure className="shot">
          <div className="shot-chrome" aria-hidden="true"><i></i><i></i><i></i><span>{r.host}</span></div>
          <a href={r.image} target="_blank" rel="noopener noreferrer">
            <img src={r.image} alt={`First screen of ${r.host}, stamped ${v}.`} />
          </a>
          <span className="shot-cat" aria-hidden="true"><BoxCat state="verdict" verdict={v} /></span>
          <figcaption><a href={r.pageUrl} target="_blank" rel="noopener noreferrer">{r.pageUrl} <Icon name="external-link" size={14} /></a></figcaption>
        </figure>
      </div>
    </section>
  );
}

// G: tier card, D: tick, C: footer embed. ALIVE only; COPE sees how close it is; DEAD stays private.
function Status({ r }) {
  const tier = tierFor(r.verdict, r.score);
  if (r.verdict === "COPE" && r.score >= 0) {
    const gap = Math.max(1, TIERS.steel.min - r.score);
    return (
      <section className="sect wrap" id="status" aria-labelledby="status-h">
        <div className="sect-head left">
          <p className="eyebrow">Your status</p>
          <h2 id="status-h">On watch. {gap} point{gap === 1 ? "" : "s"} from Steel.</h2>
          <p className="sect-sub">Score 80 and your page earns its first ALIVE tier, a verified mark, and a footer badge. Fix what failed below, then stamp again.</p>
        </div>
        <div className="watch">
          <div className="watch-track" aria-hidden="true"><span style={{ width: `${Math.min(100, r.score)}%` }}></span><i style={{ left: `${TIERS.steel.min}%` }}></i></div>
          <div className="watch-labels"><span>You · {r.score}</span><span>Steel · {TIERS.steel.min}</span></div>
        </div>
      </section>
    );
  }
  if (!tier) return null;
  const origin = location.origin;
  const link = `${origin}/v/${r.id}`;
  const embed = (theme) =>
    `<a href="${link}"><img src="${origin}/badge/${r.id}${theme === "steel" ? "" : `?theme=${theme}`}" alt="${tier.name}, alive on Stamp My Page" width="300" height="64"></a>`;
  const c = tier.card;
  return (
    <section className="sect wrap" id="status" aria-labelledby="status-h">
      <div className="status-grid">
        <div>
          <p className="eyebrow">Your status</p>
          <h2 id="status-h">{tier.name}. {tier.line}</h2>
          <p className="sect-sub">Steel {TIERS.steel.min}–{TIERS.steel.max} · Gold {TIERS.gold.min}–{TIERS.gold.max} · Obsidian {TIERS.obsidian.min}–{TIERS.obsidian.max}.{tier.key !== "obsidian" ? " Fix what's left and stamp again to climb." : ""}</p>
        </div>
        <div className={"tier-card tier-" + tier.key} style={{ background: `linear-gradient(150deg, ${c.from} 0%, ${c.mid} 50%, ${c.to} 100%)`, color: c.ink }}>
          <p className="tier-top">
            <img src={tier.key === "obsidian" ? "/brand/smp-mark-white.svg" : "/brand/smp-mark-ink.svg"} alt="" width="20" height="20" />
            STAMP MY PAGE
            <span>NO. {String(r.number || 0).padStart(4, "0")}</span>
          </p>
          <div>
            <p className="tier-host"><img src={svgUri(tickSvg(tier, 20))} alt="" width="20" height="20" />{r.host}</p>
            <p className="tier-name">{tier.name.toUpperCase()}</p>
            <p className="tier-range" style={{ color: c.sub }}>ALIVE · {r.score} / 100</p>
          </div>
        </div>
      </div>

      <div className="embed">
        <div>
          <h3>Put it in your footer</h3>
          <p>The badge links back to this stamp. Paste the code anywhere that takes HTML.</p>
        </div>
        <div className="embed-grid">
          {["steel", "dark"].map((theme) => (
            <div key={theme} className={"embed-item " + theme}>
              <img src={svgUri(embedSvg({ tier, score: r.score, theme }))} alt={`${tier.name}, alive on Stamp My Page (${theme} badge)`} width="300" height="64" />
              <Copy text={embed(theme)} label={`Copy ${theme} badge`} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// The scorecard: what failed as cards with the fix, what passed as a quiet list.
function Checks({ r }) {
  const checks = Array.isArray(r.checks) ? r.checks : [];
  if (!checks.length) return null;
  const failed = checks.filter((k) => !k.pass);
  const passed = checks.filter((k) => k.pass && !k.skip);
  const skipped = checks.filter((k) => k.skip);
  return (
    <section className="sect band" id="checks" aria-labelledby="checks-h">
      <div className="wrap">
        <div className="sect-head">
          <p className="eyebrow">What we checked</p>
          <h2 id="checks-h">{failed.length ? `${failed.length} thing${failed.length === 1 ? "" : "s"} holding it back` : "Every check passed"}</h2>
          <p className="sect-sub">Checks a stranger runs in their first five seconds. {passed.length} passed{skipped.length ? `, ${skipped.length} couldn't be measured because the site blocks automated requests` : ""}.</p>
        </div>
        {failed.length > 0 && (
          <ol className="fails">
            {failed.map((k) => (
              <li key={k.id}>
                <span className="ic-tile red"><Icon name="x" size={20} /></span>
                <h3>{k.label}</h3>
                <p className="fail-detail">{k.detail}</p>
                <p className="fail-fix"><b>Fix</b>{k.fix}</p>
              </li>
            ))}
          </ol>
        )}
        {passed.length + skipped.length > 0 && (
          <ul className="passes">
            {passed.map((k) => (
              <li key={k.id}><span className="pass-dot"><Icon name="check" size={14} /></span><span className="pass-label">{k.label}</span><span className="pass-detail">{k.detail}</span></li>
            ))}
            {skipped.map((k) => (
              <li key={k.id} className="skipped"><span className="pass-dot"><Icon name="circle-alert" size={14} /></span><span className="pass-label">{k.label}</span><span className="pass-detail">{k.detail}</span></li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const OFFERS = {
  killSheet: {
    name: "Kill Sheet",
    pitch: "We fix it for you.",
    points: ["Your headline, subhead, and button rewritten, ready to paste", "The whole page scouted, not just the first screen", "3 to 5 fixes ranked by impact", "A free re-stamp after you ship"],
    cta: "Get the Kill Sheet",
  },
  stayAlive: {
    name: "Stay Alive",
    pitch: "We keep watching it.",
    points: ["A fresh stamp every week", "Uptime and speed checks between stamps", "An alert when the page goes down or slows down", "Cancel anytime"],
    cta: "Start Stay Alive",
  },
};

// Polar checkout with the page attached, or an email asking to be told when the offer is ready.
function offerHref(key, r) {
  const link = (DESK.offers[key]?.url || "").trim();
  if (link) {
    try {
      const u = new URL(link);
      u.searchParams.set("custom_field_data.page_url", r.pageUrl);
      return u.toString();
    } catch (_) {}
  }
  const subject = `${OFFERS[key].name} for ${r.host}`;
  const body = `I'd like the ${OFFERS[key].name} for ${r.pageUrl} (stamped ${r.verdict}).`;
  return `mailto:${DESK.contact}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function Offers({ r }) {
  const v = r.verdict;
  // A page in trouble needs fixing first; a page that works needs watching.
  const order = v === "ALIVE" ? ["stayAlive", "killSheet"] : ["killSheet", "stayAlive"];
  const failed = (r.checks || []).filter((k) => !k.pass).length;
  return (
    <section className="sect wrap" id="offers" aria-labelledby="offers-h">
      <div className="sect-head">
        <p className="eyebrow">{v === "ALIVE" ? "Keep it alive" : "Bring it back"}</p>
        <h2 id="offers-h">{v === "ALIVE" ? "Pages break quietly. We'll watch it." : "Fix it yourself, or hand it to us."}</h2>
        <p className="sect-sub">{v === "ALIVE" ? "A deploy, a slow script, a new hero. Stay Alive re-stamps every week and tells you first." : `${failed ? `${failed} thing${failed === 1 ? "" : "s"} to fix. ` : ""}The list above is free. The Kill Sheet is the rewrite, done for you.`}</p>
      </div>
      <div className="plans">
        {order.map((key, i) => {
          const o = OFFERS[key];
          const price = DESK.offers[key];
          return (
            <article key={key} className={"plan" + (i === 0 ? " main" : "")}>
              <p className="plan-label">{i === 0 ? "Recommended" : "Also"}</p>
              <h3>{o.name}</h3>
              <p className="amount">{price.price} <span>{price.per}</span></p>
              <p className="plan-note">{o.pitch}</p>
              <ul className="ticks">{o.points.map((p) => <li key={p}><Icon name="check" size={16} />{p}</li>)}</ul>
              <a className={"btn " + (i === 0 ? "btn-red" : "btn-line")} href={offerHref(key, r)} onClick={() => track("offer_click", { v })}>
                {o.cta} <Icon name="arrow-right" />
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const SHARE_TEXT = {
  DEAD: "My first screen got stamped DEAD. Fixing it in public.",
  COPE: "My first screen got stamped COPE. Close, not clear yet.",
  ALIVE: "My first screen got stamped ALIVE. A stranger gets it in five seconds.",
};

// The share card and the ways to post it. DEAD gets a way out first: not everyone posts a bad stamp.
function Share({ r }) {
  const v = r.verdict;
  const url = `${location.origin}/v/${r.id}`;
  const shared = () => track("share_copy", { v });
  const x = `https://x.com/intent/post?text=${encodeURIComponent(SHARE_TEXT[v])}&url=${encodeURIComponent(url)}`;
  const li = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  return (
    <section className="sect band" id="share" aria-labelledby="share-h">
      <div className="wrap share-grid">
        <div>
          <p className="eyebrow">Share</p>
          <h2 id="share-h">{v === "DEAD" ? "Not ready to post a DEAD?" : "Post the proof."}</h2>
          <p className="sect-sub">{v === "DEAD" ? "Fair. Fix the first screen, stamp again, then post the comeback. The link stays private until you share it." : "The link unfurls with your card on X, LinkedIn, Slack and iMessage. Only people you send it to can see it."}</p>
          <div className="share-buttons">
            <a className="btn btn-dark" href={x} target="_blank" rel="noopener noreferrer" onClick={shared}><img src="/logos/x.svg" alt="" width="16" height="16" className="invert" /> Post on X</a>
            <a className="btn btn-line" href={li} target="_blank" rel="noopener noreferrer" onClick={shared}><Icon name="share-2" /> LinkedIn</a>
            <Copy text={url} label="Copy link" done="Link copied" className="btn btn-line" onCopy={shared} />
            {r.card && <a className="btn btn-line" href={`/api/card?id=${encodeURIComponent(r.id)}`} download onClick={shared}><Icon name="download" /> Card</a>}
            {r.cardSquare && <a className="btn btn-line" href={`/api/card?id=${encodeURIComponent(r.id)}&size=square`} download onClick={shared}><Icon name="download" /> Square</a>}
          </div>
        </div>
        {r.card && (
          <a className="share-card" href={r.card} target="_blank" rel="noopener noreferrer">
            <img src={r.card} width="1200" height="630" alt={`Share card: ${r.host} stamped ${v}.`} />
          </a>
        )}
      </div>
    </section>
  );
}

const SNAP_ICON = { "Page loads": "timer", "Page weight": "weight", "Hosted on": "server", "Built with": "layers", Security: "shield-check", Status: "circle-alert", Redirects: "link", "Share preview": "image", "Page tags": "tag", "On a phone": "smartphone" };

function Snapshot({ s }) {
  const rows = snapshotRows(s);
  if (!rows.length) return null;
  return (
    <section className="sect wrap" id="stack" aria-labelledby="stack-h">
      <div className="sect-head">
        <p className="eyebrow">Stack and speed</p>
        <h2 id="stack-h">Under the hood</h2>
        <p className="sect-sub">Checked once, when we stamped the page. Load time is how long the HTML took to arrive from our server.</p>
      </div>
      <dl className="stats">
        {rows.map((row) => (
          <div key={row.label} className={row.warn ? "warn" : ""}>
            <dt><span className="ic-tile sm"><Icon name={SNAP_ICON[row.label] || "list-checks"} size={16} /></span>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Result({ r }) {
  const v = r.verdict;
  return (
    <div className="page">
      <Bar />
      <main>
        <Hero r={r} />
        <Status r={r} />
        <Checks r={r} />
        <Offers r={r} />
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
        document.title = `${r.verdict} — ${r.host} — Stamp My Page`;
        trackView("result", { v: r.verdict });
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
