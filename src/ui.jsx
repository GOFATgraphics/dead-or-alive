import { useEffect, useRef } from "react";
import { Box } from "./mascot.js";
import { createStage } from "./roam.js";
import "./mascot.css";
import Magnet from "./bits/Magnet.jsx";
import ClickSpark from "./bits/ClickSpark.jsx";

export const INK = "#12132a";
export const VERDICT_COLOR = { DEAD: "#d92d33", COPE: "#c26a05", ALIVE: "#138a43" };

export function reducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Box, the desk cat. `lookKey` changes make Box glance at the form.
export function BoxCat({ state = "idle", verdict = "", lookKey = 0, className = "" }) {
  const el = useRef(null);
  const api = useRef(null);
  useEffect(() => {
    api.current = Box.mount(el.current, { state, verdict });
    if (className) el.current.classList.add(...className.split(" "));
  }, [state, verdict, className]);
  useEffect(() => {
    if (lookKey) api.current?.look();
  }, [lookKey]);
  return <div ref={el} />;
}

// Box roaming the desk. `control` receives { home, resume, look }.
export function BoxStage({ closed = false, control }) {
  const el = useRef(null);
  useEffect(() => {
    const stage = createStage(el.current, { closed });
    if (control) control.current = stage;
    stage.start();
    return () => stage.stop();
  }, [closed, control]);
  return <div ref={el} />;
}

// The main button: leans toward the cursor and throws ink sparks on click.
export function InkButton({ as: Tag = "button", color = INK, className = "", children, ...props }) {
  const still = reducedMotion();
  return (
    <ClickSpark sparkColor={color} sparkCount={8} sparkRadius={22} sparkSize={9} duration={420}>
      <Magnet padding={40} magnetStrength={6} disabled={still} wrapperClassName="magnet-wrap" innerClassName="magnet-inner">
        <Tag className={"submit " + className} {...props}>
          {children}
        </Tag>
      </Magnet>
    </ClickSpark>
  );
}

// Brand mark: Box's ears peeking over a violet tile.
export function Logo({ href = "/" }) {
  return (
    <a className="logo" href={href} aria-label="DEAD OR ALIVE home">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9a7dff" /><stop offset="1" stopColor="#4b2ee0" /></linearGradient>
        </defs>
        <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#logo-g)" />
        <path d="M9 21v-9l4 3.2a8.6 8.6 0 0 1 6 0l4-3.2v9a7 7 0 0 1-14 0z" fill="#fff" />
        <circle cx="13.3" cy="20" r="1.3" fill="#3b2bc2" />
        <circle cx="18.7" cy="20" r="1.3" fill="#3b2bc2" />
        <rect x="6" y="22.5" width="20" height="5" rx="1.5" fill="#e4c69c" stroke="#12132a" strokeWidth="1.2" />
      </svg>
      <span>Dead or Alive</span>
    </a>
  );
}
