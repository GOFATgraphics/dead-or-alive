// One rule for page URLs, shared by the homepage form, the admin desk, and the API.
// A person opens these links, so only plain public web pages get through.

// Names that never resolve on the public internet, or only inside a network.
const PRIVATE_TLDS = new Set([
  "local", "localhost", "localdomain", "internal", "intranet", "private", "lan", "home", "corp",
  "test", "example", "invalid", "onion", "arpa", "alt", "home.arpa",
]);

// Returns { url } with the cleaned URL (origin + path), or { error } with a message for the person typing it.
export function checkPageUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return { error: "Paste the page URL.", code: "empty" };
  if (/\s/.test(raw)) return { error: "A page URL has no spaces.", code: "spaces" };
  if (/^[^\s/@:]+@[^\s/@]+\.[a-z]{2,}$/i.test(raw)) return { error: "That looks like an email. Paste the page URL.", code: "email_as_url" };

  // "acme.com:8080" is a host and port, not a scheme. Only "x://" or a known non-web scheme counts.
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || /^(javascript|data|vbscript|mailto|file|blob|about|tel|sms):/i.test(raw);
  if (hasScheme && !/^https?:\/\//i.test(raw)) return { error: "Use a web address that starts with https://.", code: "scheme" };

  let url;
  try {
    url = new URL(hasScheme ? raw : "https://" + raw);
  } catch (_) {
    return { error: "That is not a page URL.", code: "unparseable" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "Use a web address that starts with https://.", code: "scheme" };
  if (url.username || url.password) return { error: "Remove the name and password from the URL.", code: "credentials" };
  if (url.port) return { error: "Use the page's normal address, without a port number.", code: "port" };

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") || /^\d+(\.\d+){3}$/.test(host) || /^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) {
    return { error: "Use the page's domain name, not an IP address.", code: "ip" };
  }
  const labels = host.split(".");
  const tld = labels[labels.length - 1];
  if (labels.length < 2 || labels.some((l) => !l || l.length > 63)) return { error: "That is not a public web address.", code: "not_public" };
  if (!/^([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld) || PRIVATE_TLDS.has(tld) || PRIVATE_TLDS.has(labels.slice(-2).join("."))) {
    return { error: "That is not a public web address.", code: "not_public" };
  }

  // Keep only what identifies the page: no credentials, query, or fragment.
  // Google Play is the exception: the app is named by ?id=, so keep just that.
  const appId = host === "play.google.com" ? url.searchParams.get("id") : "";
  const query = appId && /^[\w.]{1,150}$/.test(appId) ? `?id=${appId}` : "";
  return { url: `${url.protocol}//${host}${url.pathname}${query}` };
}

// What kind of page a checked URL is, so the form can say what we'll stamp
// and the AI knows whether it's judging a landing page or a store listing.
export function pageKind(url) {
  let u;
  try {
    u = new URL(url);
  } catch (_) {
    return "web";
  }
  const host = u.hostname.toLowerCase();
  if (host === "apps.apple.com" || host === "itunes.apple.com") return "appstore";
  if (host === "play.google.com" && u.pathname.startsWith("/store/apps")) return "playstore";
  if (/\.(dmg|exe|msi|pkg|apk|aab|zip|appimage|deb|rpm)$/i.test(u.pathname)) return "download";
  if (/^(app|dashboard|console|portal|admin)\./.test(host) || /\/(login|log-in|signin|sign-in|dashboard|account|admin)(\/|$)/i.test(u.pathname)) {
    return "login";
  }
  return "web";
}

// What the form says under the URL field for each kind.
export const KIND_HINT = {
  web: "We'll check the first screen of this page.",
  appstore: "We'll check your App Store page: icon, title, subtitle, and first screenshots.",
  playstore: "We'll check your Google Play page: icon, title, short description, and first screenshots.",
  login: "That looks like it's behind a login. We stamp what a logged-out stranger sees, so send your public landing page.",
  download: "That's a file, not a page. Send the download page instead.",
};
