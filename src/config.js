// Stamps are free. Set queueOpen to false to pause the homepage form (and /api/stamp) by hand.
export const DESK = {
  queueOpen: true,
  contact: "hello@stampmypage.com",
};

// The two paid plans, as they are sold at checkout. Buying always goes through an account first:
// /dashboard?plan=killSheet signs the visitor up or in, then sends them to checkout with their email.
// Checkout brings them back to /dashboard, where the payment webhook has switched the plan on.
// Product ids and checkout links are server-only, in api/_plans.js.
export const PLANS = {
  killSheet: {
    name: "Kill Sheet",
    price: "$19",
    per: "one-time",
    pitch: "The fix list and the rewrite, ready the moment you pay.",
    points: [
      "Instant: a scout of your whole page, not just the first screen",
      "Instant: your headline, subhead, and button rewritten",
      "Instant: 3 to 5 fixes ranked by impact",
      "A free re-stamp after you ship the fixes",
      "One app review in your dashboard: signup, onboarding, and core flow",
    ],
    cta: "Get the Kill Sheet",
  },
  stayAlive: {
    name: "Stay Alive",
    price: "$20",
    per: "a month",
    pitch: "Monitoring that switches on the moment you subscribe.",
    points: [
      "Instant: monitoring on, first re-stamp runs right away",
      "A fresh stamp every week, with the score over time",
      "Daily uptime and speed checks, and an email if it goes down",
      "One app review a month in your dashboard",
      "Cancel anytime from your dashboard",
    ],
    cta: "Start Stay Alive",
  },
};
