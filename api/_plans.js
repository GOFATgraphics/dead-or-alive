// Server-only: the payment provider's product ids and checkout links for each plan. Kept out of src/ so they
// never ship in the site's JavaScript. Display text (names, prices, points) lives in src/config.js.
export const CHECKOUT = {
  killSheet: {
    productId: "0748b2d7-7376-4327-9954-6fada0b3ca80",
    url: "https://buy.polar.sh/polar_cl_tmcEQiWMApySXbv4cbc3ZaP7iCaHXwNJ01XEs1vX2IY",
  },
  stayAlive: {
    productId: "5519c850-61ad-464c-ba1a-67014d4c4d2e",
    url: "https://buy.polar.sh/polar_cl_ofuXwNOkMIagb4X5MK8d5E7E7gEGRvwkFyhmT0gM9lS",
    // The same plan billed once a year ($200). A separate product, because a product has one billing interval.
    yearly: {
      productId: "4b215eba-4694-4919-b66b-8f99b2a52bd9",
      url: "https://buy.polar.sh/polar_cl_hos0tdCJCEJdKQAx8KACyEOC9noE2jy5z35Sy0tjnI0",
    },
    // Kill Sheet owners who re-stamped: the first month at half price ($10), once. The discount has no code, so
    // it can only come from here: a checkout made by the server, or this link with it preset as a fallback.
    offer: {
      discountId: "ff31f2ca-a789-4607-a996-8ec0ffa080fc",
      url: "https://buy.polar.sh/polar_cl_9zex9oZIuDmR1WSP9p0NqPKx8rUKYM1gniK0O1X76dy",
    },
  },
};

// The provider's customer portal, for receipts and card changes.
export const PORTAL = "https://polar.sh/launchely/portal";

// Sign in with X runs through the Supabase project's X provider. The publishable key is safe to share, but it
// stays server-side so the site's JavaScript doesn't name the stack. Env overrides: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY.
export const SUPABASE = {
  url: (process.env.SUPABASE_URL || "https://mcylyhskdldapzxkczlr.supabase.co").replace(/\/$/, ""),
  key: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "sb_publishable_4kf1IuABVxmIlARwEatuJg_H7yvDMlT",
};
