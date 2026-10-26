// Stamps are free. Set queueOpen to false to pause the homepage form (and /api/stamp) by hand.
export const DESK = {
  queueOpen: true,
  contact: "hello@stampmypage.com",
};

// The two paid plans, exactly as they are in Polar. Buying always goes through an account first:
// /dashboard?plan=killSheet signs the visitor up or in, then sends them to the checkout link with their email.
// Polar's success URL brings them back to /dashboard, where the webhook has switched the plan on.
export const PLANS = {
  killSheet: {
    name: "Kill Sheet",
    price: "$19",
    per: "one-time",
    productId: "0748b2d7-7376-4327-9954-6fada0b3ca80",
    checkout: "https://buy.polar.sh/polar_cl_tmcEQiWMApySXbv4cbc3ZaP7iCaHXwNJ01XEs1vX2IY",
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
    productId: "5519c850-61ad-464c-ba1a-67014d4c4d2e",
    checkout: "https://buy.polar.sh/polar_cl_ofuXwNOkMIagb4X5MK8d5E7E7gEGRvwkFyhmT0gM9lS",
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

// Polar's customer portal, for receipts and card changes.
export const POLAR_PORTAL = "https://polar.sh/launchely/portal";
