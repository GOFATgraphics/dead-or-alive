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
  },
};

// The provider's customer portal, for receipts and card changes.
export const PORTAL = "https://polar.sh/launchely/portal";
