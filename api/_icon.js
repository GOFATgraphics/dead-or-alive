// The stamped site's icon, copied into Blob so the homepage and result page can show it (their CSP only
// allows images from this site and Blob). Tries the icons the page declares, then /favicon.ico, then
// Google's public favicon service. Resolves the Blob URL, or "" when nothing usable turns up.
import { put } from "@vercel/blob";
import { fetchPublicFile } from "./_inspect.js";

const MAX = 256 * 1024;
const EXT = { "image/png": "png", "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico", "image/svg+xml": "svg", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

// Some servers send icons as application/octet-stream; trust the bytes instead.
function sniff(buf, type) {
  if (EXT[type]) return type;
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return "image/x-icon";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(buf.subarray(0, 300).toString("utf8"))) return "image/svg+xml";
  return "";
}

async function google(host) {
  const r = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`status ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX) throw new Error("too big");
  return { buf, type: (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() };
}

export async function saveIcon(id, pageUrl, candidates = []) {
  const host = new URL(pageUrl).hostname;
  const tries = [...new Set([...candidates.filter(Boolean), new URL("/favicon.ico", pageUrl).toString()])].map((u) => () => fetchPublicFile(u, MAX));
  tries.push(() => google(host));
  for (const attempt of tries) {
    try {
      const { buf, type } = await attempt();
      const real = buf.length > 0 ? sniff(buf, type) : "";
      if (!real) continue;
      const out = await put(`icons/${id}.${EXT[real]}`, buf, { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: real, cacheControlMaxAge: 86400 });
      return out.url;
    } catch (_) {}
  }
  return "";
}
