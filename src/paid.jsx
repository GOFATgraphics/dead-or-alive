import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { BoxCat, INK } from "./ui.jsx";
import BlurText from "./bits/BlurText.jsx";
import StatusMark from "./bits/StatusMark.jsx";

function Paid() {
  return (
    <main className="paid">
      <div className="stack">
        <BoxCat state="looking" />
        <BlurText text="Paid. We're looking at your page." className="paid-title" delay={60} />
        <StatusMark status="running" label="In the queue" color={INK} size={18} fontSize={13} />
        <p>Five seconds on your first screen, then the stamp. You get a link to it by email today, ready to post.</p>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Paid />
  </StrictMode>
);
