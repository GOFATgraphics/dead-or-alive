import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { DESK } from "./config.js";
import { NAME } from "./mascot.js";
import { BoxCat, InkButton, reducedMotion } from "./ui.jsx";
import BlurText from "./bits/BlurText.jsx";
import DecryptedText from "./bits/DecryptedText.jsx";
import AnimatedContent from "./bits/AnimatedContent.jsx";

const still = reducedMotion();

function Title() {
  if (still) return <h1 className="name">DEAD<br />OR ALIVE</h1>;
  return (
    <h1 className="name" aria-label="DEAD OR ALIVE">
      <BlurText text="DEAD" className="blur-line" delay={120} />
      <BlurText text="OR ALIVE" className="blur-line" delay={120} />
    </h1>
  );
}

function Word({ text, tone }) {
  if (still) return <span className={"word " + tone}>{text}</span>;
  return (
    <DecryptedText
      text={text}
      animateOn="inViewHover"
      sequential
      speed={70}
      characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ"
      useOriginalCharsOnly={false}
      parentClassName={"word " + tone}
      encryptedClassName="scrambled"
    />
  );
}

function Reveal({ children, delay = 0 }) {
  if (still) return children;
  return (
    <AnimatedContent distance={40} duration={0.7} delay={delay} threshold={0.15}>
      {children}
    </AnimatedContent>
  );
}

const SPECIMENS = [
  {
    stamp: "dead",
    sentence: "A stranger cannot tell what is being sold before they scroll.",
    shot: (
      <>
        <div className="nav"><span>Product</span><span>Pricing</span><span className="end">Login</span></div>
        <div className="hero">
          <span className="ring"></span>
          <h3>We help teams do better</h3>
          <p>The all-in-one platform for what's next.</p>
        </div>
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
        <div className="hero">
          <span className="ring"></span>
          <h3>The operating system for modern teams</h3>
          <p>Ship faster with one workspace.</p>
        </div>
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
        <p className="kicker alive">For studios under 20 people</p>
        <div className="hero">
          <span className="ring ok"></span>
          <h3>Payroll without a finance hire.</h3>
          <p>Run payday for a studio. Not a spreadsheet.</p>
        </div>
        <span className="fake">See how it works</span>
      </>
    ),
  },
];

function JudgeForm({ onType }) {
  const [error, setError] = useState("");
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
    <form id="judge" noValidate onSubmit={submit} onInput={onType}>
      <label className="label">Page URL
        <input id="page_url" name="page_url" type="text" inputMode="url" autoComplete="url" required placeholder="https://" />
      </label>
      <label className="label">Email
        <input id="email" name="email" type="email" autoComplete="email" required placeholder="you@company.com" />
      </label>
      <InkButton type="submit">Judge this page — $1</InkButton>
      <p className="alert" role="alert" hidden={!error}>{error}</p>
    </form>
  );
}

function Home() {
  const closed = new URLSearchParams(location.search).get("desk") === "full" || !DESK.queueOpen;
  const [look, setLook] = useState(0);
  return (
    <main className="desk">
      <p className="kicker">A stranger. Five seconds.</p>
      <Title />
      <p className="lede">First screen. Five seconds. One stamp. $1.</p>
      <p className="usp">We don't audit your site. We stamp whether a stranger gets the offer before they scroll.</p>

      <ul className="stamps">
        <li><Word text="DEAD" tone="dead" /><span>Offer, who, and why are not obvious on the first screen.</span></li>
        <li><Word text="COPE" tone="cope" /><span>Looks like a real page. The buyer still has to decode it.</span></li>
        <li><Word text="ALIVE" tone="alive" /><span>Product, buyer, and reason to pay are clear before scroll.</span></li>
      </ul>

      <section className="section" aria-label="Specimen stamps">
        <h2 className="kicker">Specimens. Not clients.</h2>
        <ul className="cards">
          {SPECIMENS.map((s, i) => (
            <li key={s.stamp}>
              <Reveal delay={i * 0.08}>
                <div className="card">
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

      <div className="companion">
        <BoxCat state={closed ? "closed" : "idle"} lookKey={look} />
        <p>
          {closed ? (
            <><strong>{NAME}</strong> is busy. The box opens again when the desk is clear.</>
          ) : (
            <>This is <strong>{NAME}</strong>. Dead or alive, nobody knows until {NAME} looks. Five seconds. One stamp.</>
          )}
        </p>
      </div>

      {closed ? (
        <p className="closed">Queue is full. New stamps open when the desk is clear.</p>
      ) : (
        <JudgeForm onType={() => setLook((n) => n + 1)} />
      )}
      <p className="fine">A circled screenshot. One sentence. The stamp. Same day.</p>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Home />
  </StrictMode>
);
