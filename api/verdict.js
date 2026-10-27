// Public. One published stamp for the result page.
// Everyone gets the stamp itself: verdict, score, tier, screenshot, share cards, badge, and the one problem that
// matters most, with its fix. The full checks, the tech stack, speed, and SEO and security details go to signed-in
// accounts only (free). Signed-out visitors get counts of what's there, so the page can show what an account unlocks.
import { readResult } from "./_lib.js";
import { sessionEmail } from "./_account.js";
import { storeReady } from "./_store.js";

const ORDER = ["headline", "plain", "who", "next", "focus", "short", "speed", "phone", "https"];

function locked(r) {
  const checks = Array.isArray(r.checks) ? r.checks : [];
  const measured = checks.filter((k) => !k.skip);
  const failed = measured.filter((k) => !k.pass);
  const top = [...failed].sort((a, b) => (b.weight || 0) - (a.weight || 0) || ORDER.indexOf(a.id) - ORDER.indexOf(b.id))[0];
  const s = r.snapshot || {};
  const b = s.browser || {};
  const { snapshot, checks: _c, ...rest } = r;
  return {
    ...rest,
    checks: top ? [top] : [],
    locked: true,
    counts: {
      checks: checks.length,
      measured: measured.length,
      passed: measured.length - failed.length,
      failed: failed.length,
      stack: Array.isArray(s.stack) ? s.stack.length : 0,
      speed: ["lcp", "ttfb", "cls", "load", "requests"].filter((k) => b[k] != null && b[k] !== 0).length,
      thirdParty: Array.isArray(b.thirdParty) ? b.thirdParty.length : 0,
      seo: s.seo ? 7 : 0,
      security: s.security ? 5 : 0,
    },
  };
}

export default async function handler(req, res) {
  // The answer depends on who's asking, so no shared cache.
  res.setHeader("Cache-Control", "private, no-store");
  const r = await readResult(String(req.query.id || ""));
  if (!r) return res.status(404).json({ error: "No stamp here." });
  const signedIn = storeReady() ? !!(await sessionEmail(req).catch(() => "")) : false;
  res.status(200).json(signedIn ? { ...r, locked: false } : locked(r));
}
