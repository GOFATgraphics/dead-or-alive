// Turns the stack and speed snapshot into plain rows. Shared by the result page, the email, and the desk.
// Each row: { label, value, warn } where warn marks something worth fixing.

const SHARE_TAGS = ["og:title", "og:description", "og:image", "twitter:card"];

export function snapshotRows(s) {
  if (!s) return [];
  if (s.skipped) return [{ label: "Stack and speed", value: s.skipped, warn: false }];
  const rows = [];
  if (s.error) {
    rows.push({ label: "Stack and speed", value: s.error, warn: true });
  } else {
    const secs = (s.loadMs / 1000).toFixed(1);
    rows.push({ label: "Page loads", value: `HTML arrives in ${secs}s`, warn: s.loadMs > 2500 });
    rows.push({ label: "Page weight", value: `${s.htmlKB < 1 ? "under 1" : s.htmlKB} KB of HTML, ${s.scripts} script${s.scripts === 1 ? "" : "s"}`, warn: s.htmlKB > 500 });
    rows.push({ label: "Hosted on", value: s.host || "Couldn't tell", warn: false });
    rows.push({ label: "Built with", value: s.built?.length ? s.built.join(", ") : "Couldn't tell", warn: false });
    if (!s.https) rows.push({ label: "Security", value: "Not on https", warn: true });
    if (s.status >= 400) rows.push({ label: "Status", value: `The page answered ${s.status}`, warn: true });
    if (s.finalUrl) rows.push({ label: "Redirects", value: `Ends at ${s.finalUrl}`, warn: s.redirects > 1 });
    const share = (s.missing || []).filter((t) => SHARE_TAGS.includes(t));
    const search = (s.missing || []).filter((t) => !SHARE_TAGS.includes(t));
    rows.push({ label: "Share preview", value: share.length ? `Missing ${share.join(", ")}` : "All set", warn: share.length > 0 });
    rows.push({ label: "Page tags", value: search.length ? `Missing ${search.join(", ")}` : "All set", warn: search.length > 0 });
  }
  if (s.mobile) rows.push({ label: "On a phone", value: s.mobile.ok ? "Works" : s.mobile.note || "Something breaks", warn: !s.mobile.ok });
  return rows;
}
