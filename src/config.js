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
    sub: "One payment, no subscription",
    pitch: "The fix list and the rewrite, ready the moment you pay.",
    audience: "Founders ready to ship improvements now",
    points: [
      "Instant: a scout of your whole page, not just the first screen",
      "Instant: your headline, subhead, and button rewritten",
      "Instant: 3 to 5 fixes ranked by impact",
      "One app review: signup, onboarding, and core flow",
      "One free re-stamp after you ship the fixes",
    ],
    limits: ["One-time purchase", "No ongoing monitoring", "No weekly alerts"],
    cta: "Get the Kill Sheet",
  },
  stayAlive: {
    name: "Stay Alive",
    price: "$20",
    per: "a month",
    yearly: { price: "$200", per: "a year", save: "Save 17%" },
    pitch: "Monitoring that switches on the moment you subscribe.",
    audience: "Growing teams and active marketers",
    points: [
      "Instant: monitoring on, first re-stamp runs right away",
      "Uptime checked every 5 minutes, for your page and up to 5 key pages",
      "Alerts by email, Slack, or Discord when it goes down and when it's back",
      "Warnings before your certificate or domain runs out, or Google is told to skip you",
      "A fresh stamp every week, and why the score moved",
      "Competitors stamped next to you, and a monthly client report",
      "One app review every month, for the site you pick",
      "More sites for $5 a month each, added from your dashboard",
    ],
    limits: ["Needs an active subscription", "One app review a month in total, not per site"],
    cta: "Start Stay Alive",
  },
};

