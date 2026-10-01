// Anonymous, cookieless event counts for the desk's Analytics tab. Sends to this site only.
// The server ignores it until Redis is connected, and skips visitors with GPC or Do Not Track on.
export function track(e, extra = {}) {
  try {
    const body = JSON.stringify({ e, ...extra });
    if (navigator.sendBeacon?.(("/api/track"), new Blob([body], { type: "application/json" }))) return;
    fetch("/api/track", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
  } catch (_) {}
}

// Where the visitor came from: another site's domain, or ?ref= / ?utm_source= when a post sets one.
export function referrer() {
  try {
    const q = new URLSearchParams(location.search);
    const tag = q.get("ref") || q.get("utm_source");
    if (tag) return tag;
    if (!document.referrer) return "";
    const host = new URL(document.referrer).hostname;
    return host === location.hostname ? "" : host;
  } catch (_) {
    return "";
  }
}

export const trackView = (p, extra = {}) => track("view", { p, r: referrer(), ...extra });
