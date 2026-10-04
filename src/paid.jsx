import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { BoxCat, INK } from "./ui.jsx";
import BlurText from "./bits/BlurText.jsx";
import StatusMark from "./bits/StatusMark.jsx";
import { trackView } from "./track.js";

function Paid() {
  return (
    <main className="paid">
      <div className="stack">
        <BoxCat state="looking" />
        <BlurText text="Paid. Your page is being stamped." className="paid-title" delay={60} />
        <StatusMark status="running" label="In the queue" color={INK} size={18} fontSize={13} />
        <p>Five seconds on your first screen, then the stamp. You get a link to it by email, usually within minutes, ready to post.</p>
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
