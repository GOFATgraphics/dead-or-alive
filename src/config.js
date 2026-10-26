// Stamps are free. Set queueOpen to false to pause the homepage form (and /api/stamp) by hand.
// Offers come after the stamp. Paste each product's Polar checkout link; the page URL is passed along in the
// custom field `page_url`. An empty link shows the offer with a "tell me when it's ready" email link instead.
// Polar success URLs: Kill Sheet → /paid/sheet, Stay Alive → /paid/alive.
export const DESK = {
  queueOpen: true,
  offers: {
    killSheet: { url: "", price: "$19", per: "one-time" },
    stayAlive: { url: "", price: "$20", per: "per month" },
  },
  contact: "hello@stampmypage.com",
};
