# DEAD OR ALIVE

First screen. Five seconds. One stamp. $1.

Static desk. Polar hosted checkout. No other price on this page.

## Turn the button on

1. In Polar, create the $1 **Verdict** product. Required custom field slug: `page_url`. No benefits. Discount codes off. Do not put other products on this checkout link.
2. Paste that checkout link into `polarVerdictUrl` in [desk.js](desk.js).
3. Set the link’s success URL to `https://<your-domain>/paid?checkout_id={CHECKOUT_ID}`.

Later links, not linked from this page:

| Product | Success URL |
|---|---|
| Kill Sheet | `/paid/sheet` |
| Resurrection | `/paid/resurrection` |
| Stay Alive | `/paid/alive` |

When the queue is full, set `queueOpen` to `false` in `desk.js`. The button is replaced with: “Queue is full. New stamps open when the desk is clear.”

Deploy on Vercel from this repo. Do not use the Polar organization storefront as the homepage. It lists every product.
