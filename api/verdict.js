// One published stamp for the result page. Stage 1, public: verdict, score, sentence, screenshot, every
// check with its fix, and the share card. Stage 2, a free account: the full technical snapshot, with no
// DNS check just to read it. Everyone else gets section headings and stack categories, never the values,
// and never through a cached copy: the response varies by account, so it is never cached publicly.
import { readResult } from "./_lib.js";
import { sessionEmail } from "./_account.js";
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
  if (email && snapshot) return res.status(200).json({ ...r, snapshot, locked: false });
  const gated = gatedSnapshot(snapshot);
  if (!gated) {
    const { snapshot: _drop, ...rest } = r;
    return res.status(200).json({ ...rest, checks: publicChecks(rest.checks), snapshot: snapshot || null, locked: false });
  }
  const { snapshot: _drop, ...rest } = r;
  return res.status(200).json({ ...rest, checks: publicChecks(rest.checks), snapshot: gated, locked: true });
}
