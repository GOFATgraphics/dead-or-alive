import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { DESK } from "./config.js";
import { NAME } from "./mascot.js";
import { BoxCat, BoxStage, InkButton, Logo, reducedMotion } from "./ui.jsx";
import BlurText from "./bits/BlurText.jsx";
import DecryptedText from "./bits/DecryptedText.jsx";
import AnimatedContent from "./bits/AnimatedContent.jsx";

const still = reducedMotion();

function Reveal({ children, delay = 0 }) {
  if (still) return children;
  return (
    <AnimatedContent distance={24} duration={0.9} delay={delay} threshold={0.1} scale={0.98} ease="power3.out">
      {children}
    </AnimatedContent>
  );
}

function Word({ text, className = "" }) {
  if (still) return <span className={className}>{text}</span>;
  return (
    <DecryptedText
      text={text}
      animateOn="view"
      sequential
      speed={70}
      characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ"
      parentClassName={className}
      encryptedClassName="scrambled"
    />
  );
}

const Tick = () => (
  <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 6.2l2 2 4-4.4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

function Hills() {
  return (
    <svg className="hills" viewBox="0 0 1440 520" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="h1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d9c9f4" /><stop offset="1" stopColor="#c6b4ee" /></linearGradient>
        <linearGradient id="h2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#efc9dc" /><stop offset="1" stopColor="#c9b0ea" /></linearGradient>
        <linearGradient id="h3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b9a2ea" /><stop offset="1" stopColor="#8f76db" /></linearGradient>
        <linearGradient id="h4" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a68ce6" /><stop offset="1" stopColor="#7559cf" /></linearGradient>
        <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#fff" stopOpacity="0.35" /></linearGradient>
      </defs>
      <path d="M0 250 C180 180 300 150 470 190 C620 225 700 120 880 110 C1040 100 1180 170 1300 150 C1370 140 1410 120 1440 110 V520 H0Z" fill="url(#h1)" opacity="0.75" />
      <path d="M0 300 C160 250 330 230 520 280 C700 330 820 250 980 240 C1150 230 1290 290 1440 250 V520 H0Z" fill="url(#h2)" />
      <path d="M0 370 C200 320 360 330 560 370 C760 410 900 330 1100 330 C1250 330 1350 360 1440 350 V520 H0Z" fill="url(#h3)" opacity="0.9" />
      <path d="M0 440 C220 400 420 420 640 440 C860 460 1060 400 1260 410 C1350 415 1410 425 1440 430 V520 H0Z" fill="url(#h4)" />
      <rect x="0" y="200" width="1440" height="320" fill="url(#haze)" />
    </svg>
  );
}

function RingCard() {
  const r = 30, c = 2 * Math.PI * r;
  return (
    <div className="fcard fc-ring">
      <div className="fcard-head"><h4>A stranger's read</h4></div>
      <div className="ringwrap">
        <svg viewBox="0 0 72 72" aria-hidden="true">
          <circle cx="36" cy="36" r={r} fill="none" stroke="#ece8fb" strokeWidth="8" />
          <circle cx="36" cy="36" r={r} fill="none" stroke="url(#rg)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${c * 0.72} ${c}`} transform="rotate(-90 36 36)" />
          <defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stopColor="#9a7dff" /><stop offset="1" stopColor="#5b3df5" /></linearGradient></defs>
        </svg>
        <div><div className="big">5s</div><div className="small">First screen.<br />Before they scroll.</div></div>
      </div>
    </div>
  );
}

function DeskCard() {
  const rows = [
    { name: "Payroll for studios", v: "ALIVE", t: "10:40" },
    { name: "CRM for agencies", v: "COPE", t: "12:15" },
    { name: "AI meeting notes", v: "DEAD", t: "14:05" },
    { name: "Your page", v: "", t: "Next" },
  ];
  return (
    <div className="fcard fc-desk">
      <div className="fcard-head"><h4>Today's desk</h4><span className="tag">Sample</span></div>
      <ul>
        {rows.map((r) => (
          <li key={r.name}>
            <span className={"tick" + (r.v ? "" : " wait")}>{r.v && <Tick />}</span>
            <span>{r.name}</span>
            <span className={"pill " + (r.v ? r.v.toLowerCase() : "wait")}>{r.v || r.t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VerdictCard() {
  return (
    <div className="fcard fc-verdict">
      <div className="fcard-head"><h4>Verdict</h4><span className="tag">Sample</span></div>
      <div className="mini-shot" aria-hidden="true">
        <div className="bar3"><i /><i /><i /></div>
        <div className="sk h" />
        <div className="sk" style={{ width: "92%" }} />
        <div className="sk" style={{ width: "60%" }} />
        <div className="sk" style={{ width: "34%", height: 14, background: "#12132a", marginTop: 10, borderRadius: 5 }} />
        <span className="mring" />
        <span className="mstamp">DEAD</span>
      </div>
      <p>A stranger cannot tell what is being sold before they scroll.</p>
    </div>
  );
}

function NoteCard() {
  return (
    <div className="fcard fc-note">
      <div className="av"><BoxCat state="idle" /></div>
      <div><b>{NAME} is looking</b><span>Circled screenshot. Same day.</span></div>
    </div>
  );
}

function Hero({ closed, stage }) {
  const frame = useRef(null);
  // Cards shift a few pixels with the pointer, each at its own depth.
  function onPointerMove(e) {
    if (still || e.pointerType !== "mouse") return;
    const r = frame.current.getBoundingClientRect();
    frame.current.style.setProperty("--mx", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    frame.current.style.setProperty("--my", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  }
  function onPointerLeave() {
    frame.current.style.setProperty("--mx", 0);
    frame.current.style.setProperty("--my", 0);
  }
  return (
    <section className="hero-wrap" id="top">
      <div className="hero-frame" ref={frame} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
        <div className="hero-sun" />
        <Hills />
        <div className="hero-copy">
          <h1 className="hero-title" aria-label="Is your page dead or alive?">
            {still ? (
              <>Is your page<br /><span className="grad">dead or alive?</span></>
            ) : (
              <>
                <BlurText text="Is your page" className="blur-line" delay={90} />
                <span className="grad"><BlurText text="dead or alive?" className="blur-line" delay={90} /></span>
              </>
            )}
          </h1>
          <p className="hero-sub">A stranger gives your first screen five seconds. We stamp whether they got the offer before they scroll.</p>
          <div className="hero-form">
            {closed ? (
              <p className="closed">Queue is full. New stamps open when the desk is clear.</p>
            ) : (
              <JudgeForm stage={stage} />
            )}
          </div>
        </div>
        <div className="float-stage">
          <div className="hero-box"><BoxStage closed={closed} control={stage} /></div>
          <RingCard />
          <VerdictCard />
          <DeskCard />
          <NoteCard />
        </div>
      </div>
    </section>
  );
}

const VERDICTS = [
  { v: "DEAD", title: "The offer is missing", text: "Offer, who, and why are not obvious on the first screen." },
  { v: "COPE", title: "It looks real. It isn't clear.", text: "Looks like a real page. The buyer still has to decode it." },
  { v: "ALIVE", title: "A stranger gets it", text: "Product, buyer, and reason to pay are clear before scroll." },
];

const STEPS = [
  { title: "Send the page", text: "Paste the URL and pay $1. No call, no brief, no account." },
  { title: `${NAME} looks for five seconds`, text: "First screen only, the way a stranger sees it. No scrolling, no clicking around." },
  { title: "Get the stamp", text: "A circled screenshot, one sentence, and DEAD, COPE, or ALIVE. By email, same day." },
];

const SPECIMENS = [
  {
    stamp: "dead",
    sentence: "A stranger cannot tell what is being sold before they scroll.",
    shot: (
      <>
        <div className="nav"><span>Product</span><span>Pricing</span><span className="end">Login</span></div>
        <div className="hero"><span className="ring" /><h3>We help teams do better</h3><p>The all-in-one platform for what's next.</p></div>
        <span className="fake">Get started</span>
      </>
    ),
  },
  {
    stamp: "cope",
    sentence: "A stranger cannot tell if this is for founders or agencies before they scroll.",
    shot: (
      <>
        <div className="nav"><span className="brand">North</span><span>Product</span><span>Customers</span><span className="end">Pricing</span></div>
        <div className="hero"><span className="ring" /><h3>The operating system for modern teams</h3><p>Ship faster with one workspace.</p></div>
        <div className="chips"><span>Acme</span><span>Orbit</span><span>Field</span></div>
        <span className="fake">Book a demo</span>
      </>
    ),
  },
  {
    stamp: "alive",
    sentence: "A stranger can name the product, the buyer, and the reason to pay before they scroll.",
    shot: (
      <>
        <p className="kicker alive" style={{ margin: 0 }}>For studios under 20 people</p>
        <div className="hero"><span className="ring ok" /><h3>Payroll without a finance hire.</h3><p>Run payday for a studio. Not a spreadsheet.</p></div>
        <span className="fake">See how it works</span>
      </>
    ),
  },
];

function JudgeForm({ stage }) {
  const [error, setError] = useState("");
  // Box heads home the moment someone is about to act, and wanders off again when they leave.
  const home = () => stage.current?.home();
  const onType = () => {
    home();
    stage.current?.look();
  };
  const onBlur = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) stage.current?.resume(6000);
  };
  const onPointerOver = (e) => {
    if (e.target.closest(".submit")) home();
  };
  function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const raw = String(data.get("page_url") || "").trim();
    const email = String(data.get("email") || "").trim();
    const withScheme = /^https?:\/\//i.test(raw) ? raw : raw ? "https://" + raw : "";
    let pageUrl = "";
    try {
      const url = new URL(withScheme);
      if ((url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".")) pageUrl = url.toString();
    } catch (_) {}
    if (!pageUrl) return setError("That is not a page URL.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("That is not an email.");
    const base = (DESK.polarVerdictUrl || "").trim();
    if (!base) return setError("The Polar checkout link is not connected yet.");
    const dest = new URL(base);
    dest.searchParams.set("customer_email", email);
    dest.searchParams.set("custom_field_data.page_url", pageUrl);
    location.assign(dest.toString());
  }
  return (
    <form id="judge-form" className="inline-form" noValidate onSubmit={submit} onInput={onType} onFocus={home} onBlur={onBlur} onPointerOver={onPointerOver}>
      <div className="inline-fields">
        <label className="field">
          <span className="sr-only">Page URL</span>
          <input id="page_url" name="page_url" type="text" inputMode="url" autoComplete="url" required placeholder="Your page URL" />
        </label>
        <label className="field">
          <span className="sr-only">Email for the stamp</span>
          <input id="email" name="email" type="email" autoComplete="email" required placeholder="Email for the stamp" />
        </label>
        <InkButton type="submit">Judge my page — $1</InkButton>
      </div>
      <p className="alert" role="alert" hidden={!error}>{error}</p>
      <p className="form-note"><span>$1 per page</span><span>Stamped the same day</span><span>Secure checkout by Polar</span></p>
    </form>
  );
}

// Jump to the hero form and put the cursor in the URL field.
function focusForm(e) {
  const input = document.getElementById("page_url");
  if (!input) return;
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
  setTimeout(() => input.focus({ preventScroll: true }), still ? 0 : 450);
}

function Home() {
  const closed = new URLSearchParams(location.search).get("desk") === "full" || !DESK.queueOpen;
  const stage = useRef(null);
  return (
    <>
      <header className="topbar">
        <Logo />
        <nav className="topnav" aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#verdicts">Stamps</a>
          <a href="#examples">Examples</a>
        </nav>
        <span className="price">$1 per page</span>
        <a className="btn small" href="#top" onClick={focusForm}>Judge my page</a>
      </header>

      <Hero closed={closed} stage={stage} />

      <main className="home-main">
        <section className="home-section" id="verdicts">
          <div className="section-head">
            <p className="kicker brand">Three stamps</p>
            <h2>One word. No audit. No essay.</h2>
            <p>We don't audit your site. We stamp whether a stranger gets the offer before they scroll.</p>
          </div>
          <ul className="grid3">
            {VERDICTS.map((x, i) => (
              <li key={x.v}>
                <Reveal delay={i * 0.08}>
                  <div className={"vcard " + x.v.toLowerCase()}>
                    <Word text={x.v} className={"big-word " + x.v.toLowerCase()} />
                    <h3>{x.title}</h3>
                    <p>{x.text}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </section>

        <section className="home-section" id="how">
          <div className="section-head">
            <p className="kicker brand">How it works</p>
            <h2>Five seconds is all a stranger gives you.</h2>
          </div>
          <ol className="grid3">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <Reveal delay={i * 0.08}>
                  <div className="step"><span className="num">{i + 1}</span><h3>{s.title}</h3><p>{s.text}</p></div>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>

        <section className="home-section" id="examples">
          <div className="section-head">
            <p className="kicker brand">Specimens. Not clients.</p>
            <h2>What a stamp looks like</h2>
          </div>
          <ul className="cards">
            {SPECIMENS.map((s, i) => (
              <li key={s.stamp}>
                <Reveal delay={i * 0.08}>
                  <div className="card">
                    <div className="chrome" aria-hidden="true"><i /><i /><i /></div>
                    <div className="shot">
                      {s.shot}
                      <p className={"stamp " + s.stamp}>{s.stamp.toUpperCase()}</p>
                    </div>
                    <p className="sentence">{s.sentence}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </section>

        <section className="home-section" id="judge">
          <div className="judge">
            <div className="judge-left">
              <p className="kicker brand">Get a stamp</p>
              <h2>Send a page. <span className="grad">{NAME} will look.</span></h2>
              <ul className="judge-list">
                <li>A circled screenshot of your first screen</li>
                <li>One sentence on what a stranger misses</li>
                <li>DEAD, COPE, or ALIVE. Same day.</li>
              </ul>
            </div>
            <div className="judge-cta">
              <BoxCat state="idle" />
              <InkButton as="a" href="#top" onClick={focusForm}>{closed ? "See the desk" : "Judge my page — $1"}</InkButton>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <Logo />
        <span>First screen. Five seconds. One stamp. $1.</span>
      </footer>
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Home />
  </StrictMode>
);
