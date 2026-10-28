// One published stamp for the result page. Stage 1, public: verdict, score, sentence, screenshot, every
// check with its fix, and the share card. Stage 2, a free account: the full technical snapshot, with no
// DNS check just to read it. Everyone else gets section headings and stack categories, never the values,
// and never through a cached copy: the response varies by account, so it is never cached publicly.
import { readResult } from "./_lib.js";
import { getUser, sessionEmail } from "./_account.js";
import { get } from "./_store.js";
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
  // Manual claim only: the Owned by card shows only when someone pressed Claim this site for this
  // stamp. Saving a stamp, or having it in a dashboard list, never creates the card on its own, and
  // there is no fallback to saved stamps. Only public X profile facts, never their email. No X link,
  // or no manual claim yet, means no card.
  let ownerX = null;
  try {
    const claimEmail = await get(`claim:${r.id}`).catch(() => null);
    if (claimEmail) {
      const owner = await getUser(claimEmail);
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
