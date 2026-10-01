import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { NAME } from "./mascot.js";
import { BoxCat, INK } from "./ui.jsx";
import BlurText from "./bits/BlurText.jsx";
import StatusMark from "./bits/StatusMark.jsx";

function Paid() {
  return (
    <main className="paid">
      <div className="stack">
        <BoxCat state="looking" />
        <BlurText text={`Paid. ${NAME} is in the box with your page.`} className="paid-title" delay={60} />
        <StatusMark status="running" label={`${NAME} is looking`} color={INK} size={18} fontSize={13} />
        <p>Five seconds of looking, then the stamp. You get a link to it by email today.</p>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Paid />
  </StrictMode>
);
