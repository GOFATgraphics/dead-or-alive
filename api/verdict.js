// One published stamp for the result page. Stage 1, public: verdict, score, sentence, screenshot, every
// check with its fix, and the share card. Stage 2, a free account: the full technical snapshot, with no
// DNS check just to read it. Everyone else gets section headings and stack categories, never the values,
// and never through a cached copy: the response varies by account, so it is never cached publicly.
import { readResult } from "./_lib.js";
import { getUser, sessionEmail } from "./_account.js";
import { get, members, set } from "./_store.js";
import { gatedSnapshot, migrateLegacy, publicChecks } from "./_gate.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const r = await readResult(String(req.query.id || ""));
  if (!r) return res.status(404).json({ error: "No stamp here." });
  let snapshot = r.snapshot || null;
  if (snapshot) {
    await migrateLegacy(r.id, r);
  } else {
    snapshot = await get(`snap:${r.id}`).catch(() => null);
  }
  const email = await sessionEmail(req).catch(() => "");
  // The stamp's owner, when they linked X: only public X profile facts, never their email. The owner is
  // the first account that saved the stamp, so a later visitor saving it cannot take the card over. No
  // X link, or no owner yet, means no card, and the free-account card stays as before.
  let ownerX = null;
  try {
    let ownerEmail = await get(`owner:${r.id}`).catch(() => null);
    // Retroactive: old stamps saved to an account before an owner record was kept have no owner:<id>
    // yet, even though an account is attached to them. Find that account from its saved stamps list,
    // the same way the admin list does, and cache the owner so later reads and claims respect it.
    if (!ownerEmail) {
      for (const e of await members("idx:users").catch(() => [])) {
        const u = await getUser(e).catch(() => null);
        if (u && (u.stamps || []).some((s) => s.id === r.id)) {
          ownerEmail = u.email;
          await set(`owner:${r.id}`, ownerEmail).catch(() => {});
          break;
        }
      }
    }
    if (ownerEmail) {
      const owner = await getUser(ownerEmail);
      if (owner?.x?.username) ownerX = { username: owner.x.username, name: owner.x.name || "", avatar: owner.x.avatar || "", verified: owner.x.verified === true };
    }
  } catch (_) {}
  if (email && snapshot) return res.status(200).json({ ...r, snapshot, locked: false, ownerX });
  const gated = gatedSnapshot(snapshot);
  if (!gated) {
    const { snapshot: _drop, ...rest } = r;
    return res.status(200).json({ ...rest, checks: publicChecks(rest.checks), snapshot: snapshot || null, locked: false, ownerX });
  }
  const { snapshot: _drop, ...rest } = r;
  return res.status(200).json({ ...rest, checks: publicChecks(rest.checks), snapshot: gated, locked: true, ownerX });
}
