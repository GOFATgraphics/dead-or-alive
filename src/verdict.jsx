import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { BoxCat, INK, InkButton, Logo, VERDICT_COLOR, reducedMotion } from "./ui.jsx";
import BlurText from "./bits/BlurText.jsx";
import DecryptedText from "./bits/DecryptedText.jsx";
import AnimatedContent from "./bits/AnimatedContent.jsx";
import GlareHover from "./bits/GlareHover.jsx";
import StatusMark from "./bits/StatusMark.jsx";
import { track, trackView } from "./track.js";
import { snapshotRows } from "./snapshot.js";
import { DESK } from "./config.js";
import { TIERS, embedSvg, svgUri, tickSvg, tierFor } from "./badge.js";

const still = reducedMotion();

const NEXT = {
  DEAD: "It can come back. Fix the first screen and stamp it again.",
  COPE: "Close. Make it clear, then stamp it again.",
  ALIVE: "Keep it that way. Stamp the next one.",
};

function resultId() {
  const fromPath = location.pathname.split("/").filter(Boolean)[1];
  return fromPath || new URLSearchParams(location.search).get("id") || "";
}

function Loading() {
  return (
    <main className="paid">
      <div className="stack">
        <BoxCat state="looking" />
        <StatusMark status="running" label="Opening the box" color={INK} size={18} fontSize={13} />
      </div>
    </main>
  );
}

function Missing() {
  return (
    <main className="paid">
      <div className="stack">
        <BoxCat state="closed" />
        <h1>No stamp here.</h1>
        <p>This link is wrong or the stamp was taken down.</p>
        <a className="link" href="/">Stamp yours free</a>
      </div>
    </main>
  );
}

function CopyLink({ verdict }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      track("share_copy", { v: verdict });
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (_) {
      prompt("Copy this link", location.href);
    }
  }
  return (
    <button type="button" className="link" onClick={copy} aria-live="polite">
      {copied ? "Link copied. Post it." : "Copy link to post"}
    </button>
  );
}

function Snapshot({ s }) {
  const rows = snapshotRows(s);
  if (!rows.length) return null;
  return (
    <section className="section snapshot">
      <h2 className="kicker brand">Stack and speed</h2>
      <dl className="snap-rows">
        {rows.map((row) => (
          <div key={row.label} className={row.warn ? "warn" : ""}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="fine">Checked once, when we stamped the page. Load time is how long the HTML took to arrive from our server.</p>
    </section>
  );
}

const SHARE_TEXT = {
  DEAD: "My first screen got stamped DEAD. Fixing it in public.",
  COPE: "My first screen got stamped COPE. Close, not clear yet.",
  ALIVE: "My first screen got stamped ALIVE. A stranger gets it in five seconds.",
};

// The share card and the ways to post it. DEAD gets a way out first: not everyone posts a bad stamp.
// The rules' scorecard: what failed first, each with the fix. Free, and the reason to want the Kill Sheet.
function Checks({ r }) {
  const checks = Array.isArray(r.checks) ? r.checks : [];
  if (!checks.length) return null;
  const failed = checks.filter((k) => !k.pass);
  const passed = checks.filter((k) => k.pass);
  return (
    <section className="section checks">
      <div className="checks-head">
        <h2 className="kicker brand">What we checked</h2>
        <p className="checks-score"><strong>{r.score}</strong>/100 · {passed.length} of {checks.length} passed</p>
      </div>
      <ul className="check-list">
        {[...failed, ...passed].map((k) => (
          <li key={k.id} className={k.pass ? "pass" : "fail"}>
            <span className="check-mark" aria-label={k.pass ? "Passed" : "Failed"}>{k.pass ? "✓" : "✕"}</span>
            <div>
              <p className="check-label">{k.label}</p>
              <p className="check-detail">{k.detail}</p>
              {!k.pass && <p className="check-fix"><strong>Fix:</strong> {k.fix}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const OFFERS = {
  killSheet: {
    name: "Kill Sheet",
    pitch: "We fix it for you.",
    points: [
      "Your headline, subhead, and button rewritten, ready to paste",
      "The whole page scouted, not just the first screen",
      "3 to 5 fixes ranked by impact",
      "A free re-stamp after you ship",
    ],
    cta: "Get the Kill Sheet",
  },
  stayAlive: {
    name: "Stay Alive",
    pitch: "We keep watching it.",
    points: [
      "A fresh stamp every week",
      "Uptime and speed checks between stamps",
      "An alert when the page goes down or slows down",
      "Cancel anytime",
    ],
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
  const lead = v === "ALIVE" ? "It works today. Pages break quietly: a deploy, a slow script, a new hero." : `${failed ? `${failed} thing${failed === 1 ? "" : "s"} to fix. ` : ""}You can do it yourself with the list above, or hand it to us.`;
  return (
    <section className="section offers" id="offers">
      <h2 className="kicker brand">{v === "ALIVE" ? "Keep it alive" : "Bring it back"}</h2>
      <p className="lede">{lead}</p>
      <div className="offer-grid">
        {order.map((key, i) => {
          const o = OFFERS[key];
          const price = DESK.offers[key];
          return (
            <article key={key} className={"offer" + (i === 0 ? " main" : "")}>
              <p className="offer-name">{o.name}</p>
              <p className="offer-price"><strong>{price.price}</strong> {price.per}</p>
              <p className="offer-pitch">{o.pitch}</p>
              <ul className="offer-points">{o.points.map((p) => <li key={p}>{p}</li>)}</ul>
              <a className={"submit" + (i === 0 ? "" : " ghost")} href={offerHref(key, r)} onClick={() => track("offer_click", { v })}>
                {o.cta}
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// The status a stamp earns (G: tier card, D: tick, C: footer embed). ALIVE only; COPE sees how close it is.
function CopyButton({ text, label }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch (_) {
      prompt("Copy this", text);
    }
  }
  return (
    <button type="button" className="submit ghost small" onClick={copy} aria-live="polite">
      {done ? "Copied" : label}
    </button>
  );
}

function Status({ r }) {
  const tier = tierFor(r.verdict, r.score);
  if (r.verdict === "COPE" && r.score >= 0) {
    const gap = Math.max(1, TIERS.steel.min - r.score);
    return (
      <section className="section status">
        <h2 className="kicker brand">Your status</h2>
        <div className="watch-card">
          <p className="watch-name">On watch</p>
          <p className="watch-line"><strong>{gap} point{gap === 1 ? "" : "s"}</strong> to Steel, the first ALIVE tier. Fix what failed below, then stamp again.</p>
          <div className="watch-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (r.score / TIERS.steel.min) * 100)}%` }}></span></div>
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
    <section className="section status">
      <h2 className="kicker brand">Your status</h2>
      <div className="tier-row">
        <div className={"tier-card tier-" + tier.key} style={{ background: `linear-gradient(150deg, ${c.from} 0%, ${c.mid} 50%, ${c.to} 100%)`, color: c.ink }}>
          <div className="tier-top">
            <img src={tier.key === "obsidian" ? "/brand/smp-mark-white.svg" : "/brand/smp-mark-ink.svg"} alt="" width="22" height="22" />
            <span>STAMP MY PAGE</span>
            <span className="tier-no">NO. {String(r.number || 0).padStart(4, "0")}</span>
          </div>
          <div>
            <p className="tier-host"><img src={svgUri(tickSvg(tier, 22))} alt="" width="22" height="22" />{r.host}</p>
            <p className="tier-name">{tier.name.toUpperCase()}</p>
            <p className="tier-range" style={{ color: c.sub }}>ALIVE · {r.score} / 100</p>
          </div>
        </div>
        <div className="tier-copy">
          <p className="tier-line">{tier.line}</p>
          <p className="fine">Tiers: Steel {TIERS.steel.min}–{TIERS.steel.max}, Gold {TIERS.gold.min}–{TIERS.gold.max}, Obsidian {TIERS.obsidian.min}–{TIERS.obsidian.max}.{tier.key !== "obsidian" ? " Re-stamp after you fix something to climb." : ""}</p>
        </div>
      </div>

      <div className="embed-box">
        <h3 className="embed-h">Put it in your footer</h3>
        <p className="fine">The badge links back to this stamp. Paste it anywhere that takes HTML.</p>
        <div className="embed-grid">
          {["steel", "dark"].map((theme) => (
            <div key={theme} className={"embed-item " + theme}>
              <img src={svgUri(embedSvg({ tier, score: r.score, theme }))} alt={`${tier.name}, alive on Stamp My Page (${theme} badge)`} width="300" height="64" />
              <CopyButton text={embed(theme)} label={`Copy ${theme} badge code`} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ShareCard({ r }) {
  const v = r.verdict;
  const url = `${location.origin}/v/${r.id}`;
  const shared = () => track("share_copy", { v });
  const x = `https://x.com/intent/post?text=${encodeURIComponent(SHARE_TEXT[v])}&url=${encodeURIComponent(url)}`;
  const li = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  return (
    <section className="section share-card">
      <h2 className="kicker brand">Post it</h2>
      {v === "DEAD" && (
        <div className="resurrect">
          <p><strong>Not ready to post a DEAD?</strong> Fix the first screen, then post the comeback.</p>
          <InkButton as="a" href="#offers" color={VERDICT_COLOR.DEAD} onClick={() => track("result_cta", { v })}>
            See how to fix it
          </InkButton>
        </div>
      )}
      <a className="card-preview" href={r.card} target="_blank" rel="noopener noreferrer">
        <img src={r.card} width="1200" height="630" alt={`Share card: ${r.host} stamped ${v}.`} />
      </a>
      <div className="share-buttons">
        <a className="submit" href={x} target="_blank" rel="noopener noreferrer" onClick={shared}>Share on X</a>
        <a className="submit ghost" href={li} target="_blank" rel="noopener noreferrer" onClick={shared}>Share on LinkedIn</a>
        <a className="submit ghost" href={`/api/card?id=${encodeURIComponent(r.id)}`} download onClick={shared}>Download card</a>
        {r.cardSquare && (
          <a className="submit ghost" href={`/api/card?id=${encodeURIComponent(r.id)}&size=square`} download onClick={shared}>Square for Instagram</a>
        )}
      </div>
    </section>
  );
}

function Result({ r }) {
  const v = r.verdict;
  const when = r.createdAt ? new Date(r.createdAt).toLocaleDateString([], { dateStyle: "medium" }) : "";

  const shot = (
    <GlareHover width="100%" height="auto" background="#fff" borderColor="var(--line)" borderRadius="14px" glareColor="#ffffff" glareOpacity={0.45} glareSize={300} transitionDuration={900} className="result-shot">
      <a href={r.image} target="_blank" rel="noopener noreferrer">
        <img src={r.image} alt={`First screen of ${r.host}, stamped ${v}.`} />
      </a>
    </GlareHover>
  );

  return (
    <main className={"desk result v-" + v.toLowerCase()}>
      <Logo />
      <div className="result-card">
      <p className="kicker brand host-line">We looked at {r.host}{tierFor(v, r.score) && <img src={svgUri(tickSvg(tierFor(v, r.score), 16))} alt={`${tierFor(v, r.score).name} tier`} width="16" height="16" />}{when ? ` · ${when}` : ""}</p>
      <h1 className="verdict-word" style={{ color: VERDICT_COLOR[v] }}>
        {still ? v : (
          <DecryptedText text={v} animateOn="view" sequential speed={90} characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ" encryptedClassName="scrambled" />
        )}
      </h1>

      <div className="companion verdict-row">
        <BoxCat state="verdict" verdict={v} />
        {still ? <p className="verdict-sentence">{r.sentence}</p> : (
          <BlurText text={r.sentence} className="verdict-sentence" delay={40} direction="bottom" stepDuration={0.3} />
        )}
      </div>

      <section className="section">
        {still ? shot : <AnimatedContent distance={50} scale={0.97} duration={0.9} delay={0.4}>{shot}</AnimatedContent>}
        <p className="fine">
          <a href={r.pageUrl} target="_blank" rel="noopener noreferrer">{r.pageUrl}</a>
        </p>
      </section>
      </div>

      <Status r={r} />

      <Checks r={r} />

      <Offers r={r} />

      {r.card && <ShareCard r={r} />}

      <Snapshot s={r.snapshot} />

      <section className="section next">
        <h2 className="kicker brand">Next</h2>
        <p className="lede">{NEXT[v]}</p>
        <div className="offer-list">
          <InkButton as="a" href="/" color={VERDICT_COLOR[v]} onClick={() => track("result_cta", { v })}>
            Stamp another page free
          </InkButton>
        </div>
        <div className="share">
          <CopyLink verdict={v} />
        </div>
      </section>
    </main>
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
