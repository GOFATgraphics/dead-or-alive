import { useEffect, useState } from "react";

// A short confirmation at the bottom of the screen: one line, one optional link, closes itself.
export function Toast({ text, href, action, ms = 9000 }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setOpen(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  if (!open) return null;
  return (
    <div className="toast" role="status">
      <span className="toast-dot" aria-hidden="true"></span>
      <span className="toast-text">{text}</span>
      {href && <a href={href}>{action}</a>}
      <button type="button" aria-label="Close" onClick={() => setOpen(false)}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
    </div>
  );
}
