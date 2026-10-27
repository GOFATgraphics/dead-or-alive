// Prices show only to people who've run a free check: this browser started or opened a stamp, or the signed-in
// account has a stamp or a plan. Remembered on this device; every read and write is allowed to fail.
const KEY = "smp.checked";

export function hasChecked(user) {
  if (user && ((user.stamps || []).length || user.member || user.killSheetActive || user.stayAliveActive)) return true;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch (_) {
    return false;
  }
}

export function markChecked() {
  try {
    localStorage.setItem(KEY, "1");
  } catch (_) {}
}
