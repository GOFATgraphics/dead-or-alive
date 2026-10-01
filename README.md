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

The homepage closes the form by itself when `QUEUE_LIMIT` paid pages are waiting for a stamp (it asks `/api/queue` on load and again before checkout). To close it by hand, set `queueOpen` to `false` in `src/config.js`. The button is replaced with: “Queue is full. New stamps open when the desk is clear.”

Deploy on Vercel from this repo. Vercel runs `npm run build` (Vite) and serves `dist/`. Locally: `npm install`, then `npm run dev`. Do not use the Polar organization storefront as the homepage. It lists every product.

## Admin desk and result pages

`/admin` lists paid Polar orders. Stamp one, press **Publish verdict**, and the customer gets an email with their own result page at `/v/<id>`: the verdict, Box holding it up, the circled screenshot, and the next offer. Shared links show the stamp as their preview image.

1. In Vercel, add **Blob** storage to the project (Storage tab). It sets `BLOB_READ_WRITE_TOKEN`.
2. In Polar, create an organization access token with `orders:read`.
3. In [Resend](https://resend.com), verify your sending domain and create an API key.
4. In Vercel project env vars, set:
   - `ADMIN_KEY`: the password for `/admin`. At least 32 characters, random. Make one with `openssl rand -base64 36`. Without it (or if it's shorter), the admin API answers 503.
   - `POLAR_ACCESS_TOKEN`: the token from step 2.
   - `RESEND_API_KEY` and `MAIL_FROM` (for example `Box <box@yourdomain.com>`).
   - `SITE_URL`: your domain, for example `https://deadoralive.xyz`. Emails, canonical links, share tags, robots.txt, and the sitemap use it. Without it, the build falls back to Vercel's production domain.
   - `CONTACT_EMAIL`: the address shown on the privacy and terms pages for deletion requests and questions.
   - `QUEUE_LIMIT`: how many paid pages may wait for a stamp before the homepage closes the form (default 10).
   - Optional: `POLAR_VERDICT_PRODUCT_ID`, so only Verdict orders count toward the queue; `POLAR_ORGANIZATION_ID`; `POLAR_API_BASE=https://sandbox-api.polar.sh` for sandbox; `RESULT_SECRET` so result links do not change if you rotate `ADMIN_KEY`.
5. Redeploy. Open `/admin` and enter the key.

Per order: **Stamp**, paste or drop the first-screen screenshot, mark it up, pick DEAD / COPE / ALIVE, write one sentence, **Publish verdict**.

The editor: **Circle** draws a marker ring, **Pen** draws freehand, S / M / L sets the marker size. Click a mark to select it, drag to move it, pull a corner to resize a circle. Drag the stamp to move it. Undo with Ctrl+Z, redo with Ctrl+Shift+Z, Delete removes the selected mark. Publishing again replaces the stamp at the same link. Without Resend set up, publishing still works; use **Draft email** to send the link yourself.

Result-page buttons come from `offers` in `src/config.js`: Resurrection and Kill Sheet for DEAD, Kill Sheet for COPE, Stay Alive for ALIVE. An empty link hides its button.

Stamped screenshots and verdicts are public files in Blob storage. Customer emails are not stored there.

## Security, SEO, and speed

- Security headers (CSP, frame blocking, nosniff, referrer and permissions policies) are in `vercel.json`. The CSP allows only this site, plus stamped images from Vercel Blob. Fonts are self-hosted in `public/fonts`, so no third party is involved.
- Page URLs are checked by `src/url.js` in the form, the admin desk, and the publish API. It rejects credentials, IP addresses, ports, and non-public names, and keeps only origin plus path.
- The homepage is plain HTML, so crawlers read the whole page. Its script is about 6 KB gzipped. React loads only on the result and payment pages.
- `robots.txt` and `sitemap.xml` are generated at build. Preview deployments disallow all crawling. Private pages are not listed in robots.txt; `/admin`, `/paid`, and `/v/` send `noindex` headers instead.
- The admin API blocks an IP for 15 minutes after 5 wrong keys, and slows every wrong guess. The count is kept per server instance, so for a hard global limit add a Vercel Firewall rate-limit rule on `/api/orders` and `/api/publish`.
- Hashed assets and fonts are cached for a year.
- `/privacy` and `/terms` are short, plain pages. Review them before launch: the refund line and the "keep until you ask" retention are policy choices for you to confirm.

## Box and React Bits

Box, the desk cat, lives in `src/mascot.js`. The name is `NAME` there. On the homepage Box jumps out of the box, walks the desk, sits, and hops back in (`src/roam.js`). When a visitor clicks into the form, types, or reaches for the button, Box runs home and watches. Box wanders off again a few seconds after they leave the form.

The result and payment pages use [React Bits](https://reactbits.dev) components, copied into `src/bits/`. See [src/bits/README.md](src/bits/README.md). The homepage uses small plain-JavaScript ports of the same effects (decrypt, magnet, click spark) in `src/home.js` to stay light. Everything holds still for visitors with reduced motion turned on, and all content is visible without scrolling or JavaScript animation.
