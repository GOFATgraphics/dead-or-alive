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
  if (!raw) return { error: "Paste the page URL." };
  if (/\s/.test(raw)) return { error: "A page URL has no spaces." };
  if (/^[^\s/@:]+@[^\s/@]+\.[a-z]{2,}$/i.test(raw)) return { error: "That looks like an email. Paste the page URL." };

  // "acme.com:8080" is a host and port, not a scheme. Only "x://" or a known non-web scheme counts.
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || /^(javascript|data|vbscript|mailto|file|blob|about|tel|sms):/i.test(raw);
  if (hasScheme && !/^https?:\/\//i.test(raw)) return { error: "Use a web address that starts with https://." };

  let url;
  try {
    url = new URL(hasScheme ? raw : "https://" + raw);
  } catch (_) {
    return { error: "That is not a page URL." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "Use a web address that starts with https://." };
  if (url.username || url.password) return { error: "Remove the name and password from the URL." };
  if (url.port) return { error: "Use the page's normal address, without a port number." };

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") || /^\d+(\.\d+){3}$/.test(host) || /^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) {
    return { error: "Use the page's domain name, not an IP address." };
  }
  const labels = host.split(".");
  const tld = labels[labels.length - 1];
  if (labels.length < 2 || labels.some((l) => !l || l.length > 63)) return { error: "That is not a public web address." };
  if (!/^([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld) || PRIVATE_TLDS.has(tld) || PRIVATE_TLDS.has(labels.slice(-2).join("."))) {
    return { error: "That is not a public web address." };
  }

  // Keep only what identifies the page: no credentials, query, or fragment.
  return { url: `${url.protocol}//${host}${url.pathname}` };
}
