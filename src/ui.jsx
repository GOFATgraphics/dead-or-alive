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

// Brand mark: the Stamp My Page roundel and wordmark.
export function Logo({ href = "/" }) {
  return (
    <a className="logo" href={href} aria-label="Stamp My Page home">
      <img src="/brand/smp-icon.svg" alt="" width="40" height="40" />
      <span>Stamp My Page</span>
    </a>
  );
}
