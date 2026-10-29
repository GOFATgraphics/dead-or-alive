import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./result.css";
import { BoxCat, reducedMotion } from "./ui.jsx";
import DecryptedText from "./bits/DecryptedText.jsx";
import { Icon } from "./icons.jsx";
import { track, trackView } from "./track.js";
import { markChecked } from "./checked.js";
import { snapshotRows } from "./snapshot.js";
import { DESK } from "./config.js";
import { Toast } from "./toast.jsx";
import { plansHtml, reviewHtml } from "./plans.js";
import "./plans.css";
import { TIERS, embedSvg, svgUri, tickSvg, tierFor } from "./badge.js";

const still = reducedMotion();
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
                <p>{measured.length ? `${passed} of ${measured.length} checks passed` : "First-screen score"}</p>
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

      {!r.ownerX && (
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
      )}
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
          <p className="sect-sub">Checks a stranger runs in their first five seconds, scored by rules, not AI. {passed.length} passed{skipped.length ? `, ${skipped.length} couldn't be measured because the site blocks automated requests` : ""}.</p>
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

// Saving the result: a free account, no card. Signed in already? The stamp is saved to the dashboard on the spot.
function localJobs() {
  try {
    return JSON.parse(localStorage.getItem("smp.jobs") || "[]");
  } catch (_) {
    return [];
  }
}

// A stamp claimed by hand, whose claimer linked X: who claimed it, with a link to their X profile.
// This replaces the claim card for that stamp, for every viewer, and there is no claim option on it:
// the site is already claimed. Saving a stamp never creates this card on its own.
const X_PATH = "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z";
const XLogo = ({ size = 16 }) => (<svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor"><path d={X_PATH} /></svg>);
// X's own check, in X's colours: blue for paid, gold for businesses, grey for government.
const XCheck = ({ type }) => (
  <svg className="owned-check" viewBox="0 0 22 22" width="20" height="20" role="img" aria-label="Verified on X">
    <path fill={type === "business" ? "#e2b719" : type === "government" ? "#829aab" : "#1d9bf0"} d="M20.4 11c0-1.3-.8-2.5-2-3 .5-1.2.3-2.6-.6-3.6-.9-.9-2.3-1.2-3.6-.7-.5-1.2-1.7-2-3-2s-2.6.8-3.1 2c-1.2-.5-2.6-.2-3.6.7-.9.9-1.1 2.3-.6 3.6-1.2.5-2 1.7-2 3s.8 2.5 2 3c-.5 1.2-.3 2.6.6 3.6.9.9 2.3 1.2 3.6.7.5 1.2 1.7 2 3.1 2 1.3 0 2.5-.8 3-2 1.2.5 2.6.2 3.6-.7.9-.9 1.2-2.3.7-3.6 1.1-.5 1.9-1.7 1.9-3z" />
    <path fill="#fff" d="M9.6 14.9 6.3 11.6l1.3-1.3 2 2 4.8-4.9 1.3 1.3z" />
  </svg>
);
const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e5 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n)).replace(".0", "");

// The owner's card: their X profile on the stamp they claimed, styled to the verdict and status.
function OwnedBy({ owner, r }) {
  const handle = encodeURIComponent(owner.username);
  const url = `https://x.com/${handle}`;
  const tier = tierFor(r.verdict, r.score);
  const [imgOk, setImgOk] = useState(!!owner.avatar);
  const pageUrl = `${location.origin}/v/${r.id}`;
  const shareText = `${r.host} is stamped ${r.verdict}${r.score != null ? ` ${r.score}/100` : ""}, owned by @${owner.username}.`;
  const v = String(r.verdict || "").toLowerCase();
  return (
    <section className="wrap owned-wrap" aria-labelledby="owned-h">
      <article className={`owned v-${v}${tier ? ` tier-${tier.key}` : ""}`}>
        <div className="owned-glow" aria-hidden="true"></div>
        <header className="owned-top">
          <span className="owned-eyebrow"><XLogo size={12} /> Owned by</span>
          <span className="owned-chip"><b>{r.verdict}</b>{r.score != null ? ` ${r.score}/100` : ""}{tier ? ` · ${tier.name}` : ""}</span>
        </header>
        <div className="owned-main">
          <a className="owned-avatar" href={url} target="_blank" rel="noreferrer" aria-label={`@${owner.username} on X`}>
            {imgOk ? <img src={owner.avatar} alt="" width="96" height="96" onError={() => setImgOk(false)} /> : <span>{(owner.name || owner.username || "?").slice(0, 1).toUpperCase()}</span>}
            <i aria-hidden="true"><XLogo size={11} /></i>
          </a>
          <div className="owned-id">
            <h2 id="owned-h"><a href={url} target="_blank" rel="noreferrer">{owner.name || `@${owner.username}`}</a>{owner.verified && <XCheck type={owner.verifiedType} />}</h2>
            <p className="owned-handle"><a href={url} target="_blank" rel="noreferrer">@{owner.username}</a>{owner.followers != null && <> · <b>{compact(owner.followers)}</b> follower{owner.followers === 1 ? "" : "s"}</>}</p>
            {owner.bio && <p className="owned-bio">{owner.bio}</p>}
          </div>
          <div className="owned-actions">
            <a className="btn owned-follow" href={`https://x.com/intent/follow?screen_name=${handle}`} target="_blank" rel="noreferrer" onClick={() => track("owner_follow")}><XLogo size={14} /> Follow</a>
            <a className="btn btn-line" href={`https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(pageUrl)}`} target="_blank" rel="noreferrer" onClick={() => track("owner_share")}>Share</a>
          </div>
        </div>
        <footer className="owned-foot">
          <span><Icon name="shield-check" size={14} /> Claimed with X</span>
          <span>{r.host}</span>
          {r.number ? <span>Stamp No. {String(r.number).padStart(4, "0")}</span> : null}
        </footer>
      </article>
    </section>
  );
}

function ClaimSite({ r }) {
  // Simplified claim: no account steps on this card. Connect with X is the claim itself, even
  // if X was already used for sign-up. X connect sets the claim record and returns here, where
  // the Owned by card then shows the X profile.
  return (
    <section className="wrap save-wrap" aria-labelledby="claim-h">
      <div className="save">
        <span className="ic-tile"><Icon name="shield-check" size={20} /></span>
        <div>
          <h2 id="claim-h">Claim this site.</h2>
          <p>Connect with X to claim it yourself, so anyone visiting this result page sees you as the owner.</p>
        </div>
        <div className="save-actions">
          <a className="btn btn-dark" href={`/auth/x?claim=${encodeURIComponent(r.id)}`} onClick={() => track("claim_click", { v: r.verdict })}>Connect with X</a>
        </div>
      </div>
    </section>
  );
}

function SavePrompt({ r }) {
  const [state, setState] = useState({ status: "loading" });
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/account", { cache: "no-store" });
        if (!res.ok) return live && setState({ status: "off" });
        const data = await res.json();
        if (!data.user) return live && setState({ status: "out" });
        const jobs = localJobs();
        let saved = (data.user.stamps || []).some((x) => x.id === r.id);
        if (!saved && jobs.length) {
          const c = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "claim", jobs }) }).then((x) => x.json()).catch(() => ({}));
          if (c.user) {
            try {
              localStorage.removeItem("smp.jobs");
            } catch (_) {}
          }
          saved = (c.user?.stamps || []).some((x) => x.id === r.id);
        }
        if (live) setState({ status: "in", saved });
      } catch (_) {
        if (live) setState({ status: "off" });
      }
    })();
    return () => {
      live = false;
    };
  }, [r.id]);
  if (state.status === "loading" || state.status === "off") return null;
  const next = `/dashboard?save=${encodeURIComponent(r.id)}&back=${encodeURIComponent(`/v/${r.id}`)}`;
  return (
    <section className="wrap save-wrap" aria-labelledby="save-h">
      <div className="save">
        <span className="ic-tile"><Icon name={state.status === "in" ? "check" : "user"} size={20} /></span>
        {state.status === "out" ? (
          <>
            <div>
              <h2 id="save-h">Create a free account to save it and see the details.</h2>
              <p>Keep this stamp, see all your stamps in one place, get a free re-stamp after you fix it, and see the full technical report under the hood. No card.</p>
            </div>
            <div className="save-actions">
              <a className="btn btn-dark" href={next} onClick={() => track("save_click", { v: r.verdict })}>Save it free</a>
            </div>
          </>
        ) : (
          <>
            <div>
              <h2 id="save-h">{state.saved ? "Saved to your dashboard." : "You're signed in."}</h2>
              <p>{state.saved ? "Every stamp you make while signed in lands there too." : "This stamp is saved to another account, or was made in another browser. Stamp the page again to add it to yours."}</p>
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

const secs = (ms) => `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`;
const kb = (n) => (n >= 1024 ? `${(n / 1024).toFixed(1)} MB` : `${n} KB`);

// Real numbers from the browser that took the screenshot: what a visitor waited for, not a guess.
function speedRows(b) {
  if (!b) return [];
  const rows = [];
  if (b.lcp > 0) rows.push({ label: "Main content visible", value: secs(b.lcp), note: "Largest contentful paint. Good is under 2.5s.", warn: b.lcp > 2500 });
  if (b.ttfb > 0) rows.push({ label: "Server answered", value: secs(b.ttfb), note: "Time to first byte. Good is under 0.8s.", warn: b.ttfb > 800 });
  if (b.cls != null) rows.push({ label: "Layout shift", value: String(b.cls), note: "How much the page jumps while loading. Good is under 0.1.", warn: b.cls > 0.1 });
  if (b.load > 0) rows.push({ label: "Fully loaded", value: secs(b.load), note: "Every script and image finished.", warn: b.load > 6000 });
  const k = b.kb || {};
  const total = Object.values(k).reduce((a, n) => a + (n || 0), 0);
  if (total > 0) {
    const parts = [["JS", k.js], ["Images", k.img], ["CSS", k.css], ["Fonts", k.font], ["HTML", k.html], ["Other", k.other]].filter(([, n]) => n > 0).map(([l, n]) => `${l} ${kb(n)}`);
    rows.push({ label: "Page weight", value: kb(total), note: parts.join(" · "), warn: total > 3072 });
  }
  if (b.requests > 0) rows.push({ label: "Requests", value: String(b.requests), note: `${(b.thirdParty || []).length} other domains`, warn: b.requests > 120 });
  return rows;
}

function factRows(s) {
  const rows = [];
  const seo = s.seo, sec = s.security, d = s.delivery;
  if (seo) {
    rows.push(["Search engines", seo.noindex ? "Told not to index this page" : "Allowed to index", seo.noindex]);
    rows.push(["Headlines (h1)", seo.h1Count === 1 ? "One, as it should be" : seo.h1Count ? `${seo.h1Count} on one page` : "None in the HTML", seo.h1Count !== 1]);
    rows.push(["Page title", seo.titleLength ? `${seo.titleLength} characters` : "Missing", !seo.titleLength || seo.titleLength > 65]);
    rows.push(["Description", seo.descriptionLength ? `${seo.descriptionLength} characters` : "Missing", !seo.descriptionLength || seo.descriptionLength > 170]);
    rows.push(["Canonical link", seo.canonical ? "Set" : "Not set", !seo.canonical]);
    rows.push(["Language", seo.lang || "Not set", !seo.lang]);
    if (seo.images) rows.push(["Image alt text", seo.imagesWithoutAlt ? `${seo.imagesWithoutAlt} of ${seo.images} images have none` : `All ${seo.images} images`, seo.imagesWithoutAlt > 0]);
  }
  if (sec) {
    const on = [["HSTS", sec.hsts], ["CSP", sec.csp], ["Frame protection", sec.frameOptions], ["nosniff", sec.noSniff], ["Referrer policy", sec.referrerPolicy]];
    const missing = on.filter(([, v]) => !v).map(([n]) => n);
    rows.push(["Security headers", missing.length ? `Missing ${missing.join(", ")}` : "All five set", missing.length > 2]);
  }
  if (d) {
    rows.push(["Compression", d.compression || "None", !d.compression]);
    if (d.cacheControl) rows.push(["Cache policy", d.cacheControl, false]);
  }
  return rows.map(([label, value, warn]) => ({ label, value, warn }));
}

// Grouped in a fixed order; each tool carries the evidence it was found by.
const STACK_ORDER = ["Built with", "Framework", "Hosting & CDN", "Server", "Analytics", "Ads & pixels", "Payments", "Auth & backend", "Support & chat", "Email & forms", "Scheduling", "Monitoring", "Testing & experiments", "UI & libraries", "Fonts", "Video", "Reviews", "Cookie consent"];

function Stack({ stack }) {
  if (!stack?.length) return null;
  const groups = STACK_ORDER.map((cat) => [cat, stack.filter((t) => t.category === cat)]).filter(([, ts]) => ts.length);
  return (
    <div className="stack">
      {groups.map(([cat, tools]) => (
        <div key={cat} className="stack-group">
          <h3>{cat}</h3>
          <ul>
            {tools.map((t) => (
              <li key={t.name}>
                <b>{t.name}</b>
                <span>{t.evidence}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Snapshot({ s, r }) {
  // Locked, Stage 1: headings and stack categories only, never values. No DNS check here: a free account
  // is all it takes to read the full report (Stage 2), and the server already withheld the values.
  // Locked: headings only, no second button. The SavePrompt card earlier on the page is the one
  // free-account card, and it covers both saving the stamp and seeing these details.
  if (s?.locked) {
    return (
      <section className="sect wrap" id="stack" aria-labelledby="stack-h">
        <div className="sect-head">
          <p className="eyebrow">Stack and speed</p>
          <h2 id="stack-h">Under the hood</h2>
          <p className="sect-sub">Measured once, when we stamped the page, in a real browser and from its HTML and headers. The details below need a free account. No DNS check just to read them.</p>
        </div>
        {s.hasStack && (
          <div className="hood-block">
            <h3 className="hood-h"><Icon name="layers" /> Tech stack</h3>
            <p className="hood-list">{s.stackCategories.join(", ")} detected. Tool names and evidence need a free account.</p>
          </div>
        )}
        {s.hasSpeed && (
          <div className="hood-block">
            <h3 className="hood-h"><Icon name="gauge" /> Real speed</h3>
            <p className="hood-list">Load-time measurements need a free account.</p>
          </div>
        )}
        {s.hasFacts && (
          <div className="hood-block">
            <h3 className="hood-h"><Icon name="search" /> Search, security, delivery</h3>
            <p className="hood-list">Header values and configuration details need a free account.</p>
          </div>
        )}
        {(s.hasThirdParty || s.hasFonts) && (
          <div className="hood-block hood-two">
            {s.hasThirdParty && (
              <div>
                <h3 className="hood-h"><Icon name="globe" /> Other domains loaded</h3>
                <p className="hood-list">Third-party domains need a free account.</p>
              </div>
            )}
            {s.hasFonts && (
              <div>
                <h3 className="hood-h"><Icon name="type" /> Fonts in use</h3>
                <p className="hood-list">Fonts in use need a free account.</p>
              </div>
            )}
          </div>
        )}
        {s.hasRequestRows && (
          <div className="hood-block">
            <h3 className="hood-h"><Icon name="server" /> From our own request</h3>
            <p className="hood-list">HTML size, script count, and load measurements need a free account.</p>
          </div>
        )}
      </section>
    );
  }
  const rows = snapshotRows(s);
  if (!rows.length && !s?.stack?.length) return null;
  const speed = speedRows(s?.browser);
  const facts = s ? factRows(s) : [];
  const third = s?.browser?.thirdParty || [];
  return (
    <section className="sect wrap" id="stack" aria-labelledby="stack-h">
      <div className="sect-head">
        <p className="eyebrow">Stack and speed</p>
        <h2 id="stack-h">Under the hood</h2>
        <p className="sect-sub">Measured once, when we stamped the page, in a real browser and from its HTML and headers. Every tool listed shows what it was found by. Nothing is guessed.</p>
      </div>

      {s?.stack?.length > 0 && (
        <div className="hood-block">
          <h3 className="hood-h"><Icon name="layers" /> Tech stack <span>{s.stack.length} found</span></h3>
          <Stack stack={s.stack} />
        </div>
      )}

      {speed.length > 0 && (
        <div className="hood-block">
          <h3 className="hood-h"><Icon name="gauge" /> Real speed <span>measured in the browser</span></h3>
          <dl className="stats">
            {speed.map((row) => (
              <div key={row.label} className={row.warn ? "warn" : ""}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
                <dd className="stat-note">{row.note}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {facts.length > 0 && (
        <div className="hood-block">
          <h3 className="hood-h"><Icon name="search" /> Search, security, delivery</h3>
          <dl className="stats compact">
            {facts.map((row) => (
              <div key={row.label} className={row.warn ? "warn" : ""}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {(third.length > 0 || s?.fonts?.length > 0) && (
        <div className="hood-block hood-two">
          {third.length > 0 && (
            <div>
              <h3 className="hood-h"><Icon name="globe" /> Other domains loaded <span>{third.length}</span></h3>
              <p className="hood-list">{third.slice(0, 24).join(" · ")}{third.length > 24 ? ` · and ${third.length - 24} more` : ""}</p>
            </div>
          )}
          {s?.fonts?.length > 0 && (
            <div>
              <h3 className="hood-h"><Icon name="type" /> Fonts in use</h3>
              <p className="hood-list">{s.fonts.join(" · ")}</p>
            </div>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div className="hood-block">
          <h3 className="hood-h"><Icon name="server" /> From our own request</h3>
          <dl className="stats">
            {rows.map((row) => (
              <div key={row.label} className={row.warn ? "warn" : ""}>
                <dt><span className="ic-tile sm"><Icon name={SNAP_ICON[row.label] || "list-checks"} size={16} /></span>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}

function Result({ r }) {
  const v = r.verdict;
  return (
    <div className="page">
      <Bar />
      <main>
        {justSignedIn && <Toast text="Signed in. This stamp is saved to your dashboard." href="/dashboard" action="Dashboard" />}
        <Hero r={r} />
        {r.ownerX && <OwnedBy owner={r.ownerX} r={r} />}
        <Status r={r} />
        <Checks r={r} />
        {!r.ownerX && (<><ClaimSite r={r} /><SavePrompt r={r} /></>)}
        <Share r={r} />
        {!r.ownerX && <Offers r={r} />}
        {!r.ownerX && <Snapshot s={r.snapshot} r={r} />}
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
