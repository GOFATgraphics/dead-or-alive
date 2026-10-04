import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { BoxCat, INK } from "./ui.jsx";
import BlurText from "./bits/BlurText.jsx";
import StatusMark from "./bits/StatusMark.jsx";
import { trackView } from "./track.js";

const POLL_MS = 4000;
const GIVE_UP_MS = 6 * 60 * 1000;

// Polar sends the buyer here with ?checkout_id=. Poll until the stamp exists, then open it.
function useStamp(checkoutId) {
  const [state, setState] = useState(checkoutId ? "working" : "nocheckout");
  useEffect(() => {
    if (!checkoutId) return;
    const started = Date.now();
    let timer;
    let stopped = false;
    async function tick() {
      try {
        const r = await fetch(`/api/status?checkout_id=${encodeURIComponent(checkoutId)}`, { cache: "no-store" });
        const body = r.ok ? await r.json() : {};
        if (stopped) return;
        if (body.state === "ready" && body.url) {
          setState("ready");
          window.location.replace(body.url);
          return;
        }
        if (body.state === "refunded" || body.state === "failed") return setState(body.state);
      } catch (_) {}
      if (Date.now() - started > GIVE_UP_MS) return setState("slow");
      timer = setTimeout(tick, POLL_MS);
    }
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [checkoutId]);
  return state;
}

const COPY = {
  working: {
    title: "Paid. Your page is being stamped.",
    mark: ["running", "Stamping"],
    text: "This takes about a minute. Your stamp opens right here, and a copy goes to your email.",
  },
  ready: { title: "Your stamp is ready.", mark: ["done", "Opening"], text: "Opening your stamp now." },
  nocheckout: {
    title: "Paid. Your page is being stamped.",
    mark: ["running", "Stamping"],
    text: "Your stamp arrives by email in about a minute.",
  },
  slow: {
    title: "Still stamping.",
    mark: ["running", "Taking longer"],
    text: "This one is taking longer than usual. We'll email the stamp as soon as it's done, or refund you if we can't stamp it.",
  },
  refunded: {
    title: "We couldn't stamp this page.",
    mark: ["failed", "Refunded"],
    text: "It didn't load for us, showed a login or cookie wall, or came up blank. Your $1 has been refunded, and we've emailed you the details.",
  },
  failed: {
    title: "We couldn't stamp this page.",
    mark: ["failed", "Refund on its way"],
    text: "It didn't load for us, showed a login or cookie wall, or came up blank. Your $1 will be refunded.",
  },
};

function Paid() {
  const checkoutId = new URLSearchParams(window.location.search).get("checkout_id") || "";
  const state = useStamp(checkoutId);
  const c = COPY[state];
  return (
    <main className="paid">
      <div className="stack" aria-live="polite">
        <BoxCat state="looking" />
        <BlurText key={c.title} text={c.title} className="paid-title" delay={60} />
        <StatusMark status={c.mark[0]} label={c.mark[1]} color={INK} size={18} fontSize={13} />
        <p>{c.text}</p>
        {state === "refunded" || state === "failed" ? (
          <a className="link" href="/">Back to Stamp My Page</a>
        ) : null}
      </div>
    </main>
  );
}

trackView("paid");

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Paid />
  </StrictMode>
);
