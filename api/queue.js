// Public. Is the desk taking new pages? Counts paid orders still waiting on a stamp.
// Env: QUEUE_LIMIT (default 10). Uses the same Polar and Blob settings as the admin.
import { fetchPolarOrders, isWaiting, publishedStamps } from "./_lib.js";

export default async function handler(req, res) {
  const limit = Math.max(1, parseInt(process.env.QUEUE_LIMIT || "10", 10) || 10);
  try {
    const [orders, stamps] = await Promise.all([fetchPolarOrders(), publishedStamps()]);
    const waiting = orders.filter((o) => isWaiting(o, stamps)).length;
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=30");
    // Only the yes/no leaves the server, not order counts.
    res.status(200).json({ open: waiting < limit });
  } catch (_) {
    // Not set up yet (or Polar is down): stay open. queueOpen in src/config.js is the manual switch.
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ open: true, unknown: true });
  }
}
