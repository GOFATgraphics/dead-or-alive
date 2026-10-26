// Public. The homepage polls this with the job id /api/stamp gave it, and opens the stamp when it's ready.
// The job id is random and only known to the browser that started it.
import { readResult, resultId } from "./_lib.js";
import { stampNote } from "./_stamp.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const job = String(req.query.job || "");
  if (!UUID.test(job)) return res.status(400).json({ error: "Missing job." });
  const id = resultId(job);
  if (await readResult(id)) return res.status(200).json({ state: "ready", url: `/v/${id}` });
  const note = await stampNote(id);
  if (note?.failed) return res.status(200).json({ state: "failed" });
  res.status(200).json({ state: "working" });
}
