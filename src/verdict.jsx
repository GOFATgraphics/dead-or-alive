import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { DESK } from "./config.js";
import { BoxCat, INK, InkButton, Logo, VERDICT_COLOR, reducedMotion } from "./ui.jsx";
import BlurText from "./bits/BlurText.jsx";
import DecryptedText from "./bits/DecryptedText.jsx";
import AnimatedContent from "./bits/AnimatedContent.jsx";
import GlareHover from "./bits/GlareHover.jsx";
import StatusMark from "./bits/StatusMark.jsx";
import { track, trackView } from "./track.js";
import { snapshotRows } from "./snapshot.js";

const still = reducedMotion();

const NEXT = {
  DEAD: {
    line: "It can come back.",
    offers: [
      { key: "killSheet", label: "Get the Kill Sheet" },
      { key: "resurrection", label: "Book a Resurrection" },
    ],
  },
  COPE: { line: "Close. Not clear yet.", offers: [{ key: "killSheet", label: "Get the Kill Sheet" }] },
  ALIVE: { line: "Keep it that way.", offers: [{ key: "stayAlive", label: "Stay Alive" }] },
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
        <p>This link is wrong or the stamp was taken down. Check the link in your email.</p>
        <a className="link" href="/">Judge yours — $1</a>
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
function ShareCard({ r }) {
  const v = r.verdict;
  const url = `${location.origin}/v/${r.id}`;
  const shared = () => track("share_copy", { v });
  const x = `https://x.com/intent/post?text=${encodeURIComponent(SHARE_TEXT[v])}&url=${encodeURIComponent(url)}`;
  const li = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  const fix = (DESK.offers.killSheet || DESK.offers.resurrection || "").trim();
  return (
    <section className="section share-card">
      <h2 className="kicker brand">Post it</h2>
      {v === "DEAD" && (
        <div className="resurrect">
          <p><strong>Not ready to post a DEAD?</strong> Fix the first screen, then post the comeback.</p>
          <InkButton as="a" href={fix || "/"} color={VERDICT_COLOR.DEAD} onClick={() => track("result_cta", { v })}>
            {fix ? "Resurrect it" : "Fix it, then re-stamp — $1"}
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
  const next = NEXT[v];
  const offers = next.offers.filter((o) => (DESK.offers[o.key] || "").trim());
  const when = r.createdAt ? new Date(r.createdAt).toLocaleDateString([], { dateStyle: "medium" }) : "";

  const shot = (
    <GlareHover width="100%" height="auto" background="#fff" borderColor="var(--line)" borderRadius="14px" glareColor="#ffffff" glareOpacity={0.45} glareSize={300} transitionDuration={900} className="result-shot">
      <a href={r.image} target="_blank" rel="noopener noreferrer">
        <img src={r.image} alt={`First screen of ${r.host}, circled and stamped ${v}.`} />
      </a>
    </GlareHover>
  );

  return (
    <main className={"desk result v-" + v.toLowerCase()}>
      <Logo />
      <div className="result-card">
      <p className="kicker brand">We looked at {r.host}{when ? ` · ${when}` : ""}</p>
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

      {r.card && <ShareCard r={r} />}

      <Snapshot s={r.snapshot} />

      <section className="section next">
        <h2 className="kicker brand">Next</h2>
        <p className="lede">{next.line}</p>
        {offers.length > 0 && (
          <div className="offer-list">
            {offers.map((o, i) => (
              <InkButton key={o.key} as="a" href={DESK.offers[o.key]} color={i ? INK : VERDICT_COLOR[v]} className={i ? "ghost" : ""}>
                {o.label}
              </InkButton>
            ))}
          </div>
        )}
        <div className="share">
          <CopyLink verdict={v} />
          <a className="link" href="/" onClick={() => track("result_cta", { v })}>Judge another page — $1</a>
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
