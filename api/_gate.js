// Gating, in stages. Stage 1, public: verdict, score, checks and fixes. Stage 2, a free account: the full
// technical report, with no DNS check just to read it. Stage 3, a verified website: ongoing monitoring,
// change detection, alerts, and health history. The DNS TXT proof below is for Stage 3, not for reading:
// it is per account and per host, so verifying one domain never unlocks another, and one account's proof
// never unlocks anything for anyone else.
//
// The snapshot itself is not kept in the public stamp record: publish stores it under a hashed store key
// (api/_store.js), so it cannot be rebuilt from the public record or its image URL. Older stamps, whose
// snapshot is still inside the public record, are moved to that key the first time they are read, and the
// public record is rewritten without it.
import crypto from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { put } from "@vercel/blob";
import { paths, readResult } from "./_lib.js";
import { get, set } from "./_store.js";

// A real domain, lowercased, without a trailing dot. The stamp record already strips www, so the host here
// is the apex domain for a www page too.
export function normHost(host) {
  // Strip www too, so a verify for www.example.com matches the stamp record, which already stores the
  // apex host.
  const h = String(host || "").trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (!h || h.length > 253 || !/^[a-z0-9.-]+$/.test(h) || !h.includes(".") || h.startsWith(".") || h.endsWith(".") || h.includes("..")) return "";
  return h;
}

export const recordName = (host) => `_stampmypage.${host}`;
export const verifyValue = (token) => `stampmypage-verify=${token}`;
const keyFor = (email, host) => `verify:${String(email || "").trim().toLowerCase()}:${host}`;

// The token for this account and host, created once and kept until the domain verifies. A TXT record is
// public by design, so the token is not a secret: it only proves the person who added it controls the DNS.
export async function ensureToken(email, host) {
  const h = normHost(host);
  if (!h) throw Object.assign(new Error("Use a real domain, like example.com."), { status: 400 });
  const cur = await get(keyFor(email, h)).catch(() => null);
  if (cur?.verifiedAt) return { host: h, verified: true, record: recordName(h), value: null };
  if (cur?.token) return { host: h, verified: false, record: recordName(h), value: verifyValue(cur.token) };
  const token = crypto.randomBytes(24).toString("base64url");
  await set(keyFor(email, h), { token, createdAt: new Date().toISOString() });
  return { host: h, verified: false, record: recordName(h), value: verifyValue(token) };
}

export async function isVerified(email, host) {
  const h = normHost(host);
  if (!email || !h) return false;
  const cur = await get(keyFor(email, h)).catch(() => null);
  return !!cur?.verifiedAt;
}

// Look the TXT record up and mark this account verified for the host when it matches. A missing record is
// "pending", not an error: DNS can take a few minutes to spread, and the visitor just tries again.
export async function checkDomain(email, host) {
  const h = normHost(host);
  if (!h) return { verified: false, error: "Use a real domain, like example.com." };
  const cur = await get(keyFor(email, h)).catch(() => null);
  if (cur?.verifiedAt) return { verified: true };
  if (!cur?.token) return { verified: false, error: "Ask for a verification token first." };
  const want = verifyValue(cur.token);
  let records;
  try {
    records = await resolveTxt(recordName(h));
  } catch (err) {
    if (["ENOTFOUND", "ENODATA", "ENOENT", "ESERVFAIL"].includes(err?.code)) {
      return { verified: false, pending: true, error: "No matching TXT record found yet. DNS can take a few minutes to spread, then try again." };
    }
    return { verified: false, error: "DNS lookup failed. Try again in a moment." };
  }
  const found = (records || []).map((parts) => parts.join("").trim()).includes(want);
  if (!found) return { verified: false, pending: true, error: "No matching TXT record found yet. DNS can take a few minutes to spread, then try again." };
  await set(keyFor(email, h), { ...cur, verifiedAt: new Date().toISOString() });
  return { verified: true };
}

// The full stamp, for server-side readers only (admin, scout, monitor): the public record plus the snapshot
// from the store, or the snapshot still inside an older public record.
export async function readFullResult(id) {
  const r = await readResult(id);
  if (!r) return null;
  if (r.snapshot) return r;
  const snap = await get(`snap:${id}`).catch(() => null);
  return snap ? { ...r, snapshot: snap } : r;
}

// What a visitor without a verified domain may see of the snapshot: section headings and which stack
// categories were detected, never tool names, evidence, timings, counts, header values, or delivery settings.
// Null when there is nothing gated to hide (a blocked stamp, or no snapshot at all).
export function gatedSnapshot(snapshot) {
  if (!snapshot || snapshot.skipped || snapshot.error) return null;
  const stackCategories = [...new Set((snapshot.stack || []).map((t) => t.category))];
  const gated = {
    locked: true,
    stackCategories,
    hasStack: stackCategories.length > 0,
    hasSpeed: !!snapshot.browser,
    hasFacts: !!(snapshot.seo || snapshot.security || snapshot.delivery),
    hasThirdParty: (snapshot.browser?.thirdParty || []).length > 0,
    hasFonts: (snapshot.fonts || []).length > 0,
    hasRequestRows: !!(snapshot.loadMs || snapshot.htmlKB || snapshot.host || (snapshot.built || []).length),
  };
  if (!gated.hasStack && !gated.hasSpeed && !gated.hasFacts && !gated.hasThirdParty && !gated.hasFonts && !gated.hasRequestRows) return null;
  return gated;
}

// What a visitor without an account may see of the checks: pass or fail, never the Stage 2 measurements.
// The speed and weight checks are the leak: their detail carries the load time, the HTML size, and the
// script count, which Under the hood promises need a free account. Everything else in a check (label, pass,
// fix, the headline word count, the button count) is Stage 1 reasoning and stays. Skipped checks keep their
// generic detail, which carries no figure. This runs at read time, so it fixes old stamps too, not just new ones.
export function publicChecks(checks) {
  if (!Array.isArray(checks)) return checks;
  return checks.map((k) => {
    if (k.skip) return k;
    if (k.id === "speed") return { ...k, detail: k.pass ? "Main content appears quickly." : "Main content is slow to appear." };
    if (k.id === "weight") return { ...k, detail: k.pass ? "Light enough for a first screen." : "Too heavy for a first screen." };
    return k;
  });
}

// Move a legacy snapshot out of the public record and into the store, then rewrite the public record
// without it. Best effort: a failed move still gates the response, it just stays legacy until the next read.
export async function migrateLegacy(id, record) {
  if (!record?.snapshot) return;
  try {
    await set(`snap:${id}`, record.snapshot);
    const { snapshot, ...rest } = record;
    await put(paths(id).json, JSON.stringify(rest), { access: "public", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60, contentType: "application/json" });
  } catch (err) {
    console.error("Snapshot migration failed:", id, err);
  }
}
