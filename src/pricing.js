// /pricing: the plan cards are drawn here, and only for people who've run a free check (src/checked.js).
// Everyone else sees a box that sends them to stamp a page first.
import { hasChecked, markChecked } from "./checked.js";
import { plansHtml, reviewHtml } from "./plans.js";
import { track, trackView } from "./track.js";

trackView("pricing");

function show() {
  const plans = document.getElementById("plans");
  plans.innerHTML = plansHtml({ free: true }) + reviewHtml();
  plans.hidden = false;
  plans.addEventListener("click", (e) => {
    const el = e.target.closest?.("[data-plan]");
    if (el) track("offer_click", { plan: el.dataset.plan, billing: el.dataset.billing || "", from: "pricing" });
  });
  document.getElementById("plans-gate").hidden = true;
  document.getElementById("plans-when").hidden = false;
  document.getElementById("faq").hidden = false;
}

if (hasChecked()) show();
else
  fetch("/api/account", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (d?.user && hasChecked(d.user)) {
        markChecked();
        show();
      }
    })
    .catch(() => {});
