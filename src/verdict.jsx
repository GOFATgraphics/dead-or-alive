import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { DESK } from "./config.js";
import { NAME } from "./mascot.js";
import { BoxCat, INK, InkButton, Logo, VERDICT_COLOR, reducedMotion } from "./ui.jsx";
import BlurText from "./bits/BlurText.jsx";
import DecryptedText from "./bits/DecryptedText.jsx";
import AnimatedContent from "./bits/AnimatedContent.jsx";
import GlareHover from "./bits/GlareHover.jsx";
import StatusMark from "./bits/StatusMark.jsx";

const still = reducedMotion();

const NEXT = {
  DEAD: {
    line: "It can come back.",
    offers: [
      { key: "resurrection", label: "Book a Resurrection" },
      { key: "killSheet", label: "Get the Kill Sheet" },
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
        <a className="link" href="/">Judge a page — $1</a>
      </div>
    </main>
  );
}

function CopyLink() {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (_) {
      prompt("Copy this link", location.href);
    }
  }
  return (
    <button type="button" className="link" onClick={copy} aria-live="polite">
      {copied ? "Link copied" : "Copy link"}
    </button>
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
      <p className="kicker brand">{NAME} looked at {r.host}{when ? ` · ${when}` : ""}</p>
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
          <CopyLink />
          <a className="link" href="/">Judge another page — $1</a>
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
        document.title = `${r.verdict} — ${r.host} — DEAD OR ALIVE`;
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
