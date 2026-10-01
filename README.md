# DEAD OR ALIVE

First screen. Five seconds. One stamp. $1.

Static desk. Polar hosted checkout. No other price on this page.

## Turn the button on

1. In Polar, create the $1 **Verdict** product. Required custom field slug: `page_url`. No benefits. Discount codes off. Do not put other products on this checkout link.
2. Paste that checkout link into `polarVerdictUrl` in [src/config.js](src/config.js).
3. Set the link’s success URL to `https://<your-domain>/paid?checkout_id={CHECKOUT_ID}`.

Later links, not linked from this page:

| Product | Success URL |
|---|---|
| Kill Sheet | `/paid/sheet` |
| Resurrection | `/paid/resurrection` |
| Stay Alive | `/paid/alive` |

When the queue is full, set `queueOpen` to `false` in `src/config.js`. The button is replaced with: “Queue is full. New stamps open when the desk is clear.”

Deploy on Vercel from this repo. Vercel runs `npm run build` (Vite) and serves `dist/`. Locally: `npm install`, then `npm run dev`. Do not use the Polar organization storefront as the homepage. It lists every product.

## Admin desk and result pages

`/admin` lists paid Polar orders. Stamp one, press **Publish verdict**, and the customer gets an email with their own result page at `/v/<id>`: the verdict, Box holding it up, the circled screenshot, and the next offer. Shared links show the stamp as their preview image.

1. In Vercel, add **Blob** storage to the project (Storage tab). It sets `BLOB_READ_WRITE_TOKEN`.
2. In Polar, create an organization access token with `orders:read`.
3. In [Resend](https://resend.com), verify your sending domain and create an API key.
4. In Vercel project env vars, set:
   - `ADMIN_KEY`: a long random string. The password for `/admin`.
   - `POLAR_ACCESS_TOKEN`: the token from step 2.
   - `RESEND_API_KEY` and `MAIL_FROM` (for example `Box <box@yourdomain.com>`).
   - `SITE_URL`: your domain, for example `https://deadoralive.xyz`. Links in emails use it.
   - Optional: `POLAR_ORGANIZATION_ID`; `POLAR_API_BASE=https://sandbox-api.polar.sh` for sandbox; `RESULT_SECRET` so result links do not change if you rotate `ADMIN_KEY`.
5. Redeploy. Open `/admin` and enter the key.

Per order: **Stamp**, paste or drop the first-screen screenshot, mark it up, pick DEAD / COPE / ALIVE, write one sentence, **Publish verdict**.

The editor: **Circle** draws a marker ring, **Pen** draws freehand, S / M / L sets the marker size. Click a mark to select it, drag to move it, pull a corner to resize a circle. Drag the stamp to move it. Undo with Ctrl+Z, redo with Ctrl+Shift+Z, Delete removes the selected mark. Publishing again replaces the stamp at the same link. Without Resend set up, publishing still works; use **Draft email** to send the link yourself.

Result-page buttons come from `offers` in `src/config.js`: Resurrection and Kill Sheet for DEAD, Kill Sheet for COPE, Stay Alive for ALIVE. An empty link hides its button.

Stamped screenshots and verdicts are public files in Blob storage. Customer emails are not stored there.

## Box and React Bits

Box, the desk cat, lives in `src/mascot.js`. The name is `NAME` there. On the homepage Box jumps out of the box, walks the desk, sits, and hops back in (`src/roam.js`). When a visitor clicks into the form, types, or reaches for the button, Box runs home and watches. Box wanders off again a few seconds after they leave the form.

Animations and micro-interactions use [React Bits](https://reactbits.dev) components, copied into `src/bits/`. See [src/bits/README.md](src/bits/README.md) for which does what. Everything holds still for visitors with reduced motion turned on.
