# Stamp My Page

Is your page dead or alive? Website, web app, SaaS, or app store page: we stamp its first screen DEAD, COPE, or ALIVE.

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

The homepage closes the form by itself when `QUEUE_LIMIT` paid pages are waiting for a stamp (it asks `/api/queue` on load and again before checkout). To close it by hand, set `queueOpen` to `false` in `src/config.js`. The button is replaced with: “Paused for a moment. Try again shortly.”

Deploy on Vercel from this repo. Vercel runs `npm run build` (Vite) and serves `dist/`. Locally: `npm install`, then `npm run dev`. Do not use the Polar organization storefront as the homepage. It lists every product.

## Admin desk and result pages

`/admin` lists paid Polar orders. Stamp one, press **Publish verdict**, and the customer gets an email with their own result page at `/v/<id>`: the verdict, Box holding it up, the circled screenshot, and the next offer. Shared links show the stamp as their preview image.

1. In Vercel, add **Blob** storage to the project (Storage tab). It sets `BLOB_READ_WRITE_TOKEN`.
2. In Polar, create an organization access token with `orders:read`.
3. In [Resend](https://resend.com), verify your sending domain and create an API key.
4. In Vercel project env vars, set:
   - `ADMIN_KEY`: the password for `/admin`. At least 32 characters, random. Make one with `openssl rand -base64 36`. Without it (or if it's shorter), the admin API answers 503.
   - `POLAR_ACCESS_TOKEN`: the token from step 2.
   - `RESEND_API_KEY` and `MAIL_FROM` (for example `Stamp My Page <stamps@stampmypage.com>`).
   - `SITE_URL`: your domain, for example `https://stampmypage.com`. Emails, canonical links, share tags, robots.txt, and the sitemap use it. Without it, the build falls back to Vercel's production domain.
   - `CONTACT_EMAIL`: the address shown on the privacy and terms pages for deletion requests and questions.
   - `QUEUE_LIMIT`: how many paid pages may wait for a stamp before the homepage closes the form (default 10).
   - `POLAR_VERDICT_PRODUCT_ID`: the Verdict product's ID, so only its orders show in the desk, queue, and analytics (other products in the same Polar organization are ignored); `POLAR_ORGANIZATION_ID`; `POLAR_API_BASE=https://sandbox-api.polar.sh` for sandbox; `RESULT_SECRET` so result links do not change if you rotate `ADMIN_KEY`.
   - Optional: Upstash Redis from the Vercel Marketplace (Storage → Upstash) for visitor analytics. It adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
5. Redeploy. Open `/admin` and enter the key.

Only `ADMIN_KEY` is needed to open the desk. Everything else lights up as it's connected; the **Setup** tab shows what's in and what's missing.

### What the $1 checks

$1 checks the first screen only. The Kill Sheet (not built yet) is where the whole page and flow get scouted.

The form reads the link as the visitor types (`pageKind` in `src/url.js`) and says what will be stamped:
- `apps.apple.com` / `play.google.com/store/apps`: the App Store or Google Play listing (icon, title, subtitle, first screenshots). The AI is told to judge it as a store listing, and the stack snapshot is skipped.
- `app.`, `dashboard.`, `/login`, `/dashboard` and similar: a warning that only the logged-out view gets stamped.
- Installer files (`.dmg`, `.exe`, `.apk`, ...): refused, with a note to send the download page.
- Anything else: the first screen of the page.

### Share cards

Publishing a stamp (by hand or automatically) also draws two share cards on the server (`api/_card.js`):

- **Wide, 1200×630**: the circled first screen with the stamp across it, the sentence, the domain, the date, the stamp number (#0042), and stampmypage.com. It's the link preview (`og:image`, `twitter:image`) for `/v/<id>`, so a pasted link shows the card on X, LinkedIn, Slack, and iMessage.
- **Square, 1080×1080** for Instagram and LinkedIn posts.

They're stored in Blob next to the stamp (`verdicts/<id>-card.jpg`, `-square.jpg`). The result page shows the card with **Share on X**, **Share on LinkedIn**, **Download card**, and **Square for Instagram** (`/api/card?id=…&size=wide|square`). DEAD results lead with "Not ready to post a DEAD?" and a **Resurrect it** button that goes to the Kill Sheet or Resurrection checkout when one is set in `src/config.js`, otherwise back to the homepage for a re-stamp.

Stamp numbers count up with Redis (`stamp:number`) and fall back to the number of published stamps. Republishing keeps the number. The card's bold type uses `server-fonts/` (Plus Jakarta Sans Bold and ExtraBold, IBM Plex Mono Bold, OFL), which is bundled only with the functions that draw.

### AI drafts

Every stamp starts as an AI draft. In auto mode (production) it goes out on its own; in review mode it waits in the desk.

1. Polar calls `/api/polar-webhook` when an order is paid (event `order.paid`). The webhook checks Polar's signature and answers at once.
2. In the background, [Microlink](https://microlink.io) opens the page logged out and screenshots the first screen at 1440×900 and on a 390×844 phone. At the same time the server loads the page once for the stack and speed snapshot (`api/_inspect.js`): HTML load time and size, host, framework, missing title/description/share/viewport tags. Every address and redirect is checked so it can't reach a private network.
3. Claude (`claude-opus-5-5`) reads both screenshots and returns the stamp, one sentence, what a stranger gets (product, buyer, reason), up to four boxes to circle, whether the first screen works on a phone, a confidence, and any problem (error page, cookie wall, login).
**AI chooses what, code does how.** The AI only decides the verdict, the sentence, and which regions to circle (up to 3 boxes in pixels of the desktop screenshot, each with a short label). Code does the rest and checks it: the screenshots are taken at fixed sizes, every box is checked against the image's real size, a bad answer (broken JSON, a box outside the image, no verdict) gets one retry that names the problem, and boxes that still don't fit are dropped so the stamp goes out without circles rather than failing. The first screen is always captured. If a step can't recover (screenshot fails, AI unusable twice, AI declines), a note with the reason is saved in the draft's place. In auto mode the whole run is then tried once more, and if that also fails the order is refunded through Polar (`POST /v1/refunds`, reason `service_disruption`) and the customer gets a short email; the desk shows `AI: refunded`. If Polar refuses the refund the order shows `AI: failed` with the reason.

The $1 tier skips a scouting step. Scouting the whole page (the AI reading its text and links and choosing extra sections to capture, like pricing or signup) belongs to the Kill Sheet and Stay Alive.

4. The draft is saved to Blob under `drafts/`. In the desk the order shows `AI: COPE`; opening it loads the screenshot with the circles drawn, the stamp picked, and the sentence filled in. Edit anything, then **Publish verdict** as before.

**Modes.** `STAMP_MODE=review` (the default): every draft waits in the desk. `STAMP_MODE=auto`: a draft with high or medium confidence and no flagged problem is drawn on the server (`api/_render.js`, the same drawing code as the editor in `src/stamp-draw.js`), published, and emailed right away. Anything else is retried once from scratch, then refunded. The desk shows which ones went out automatically, and publishing again replaces them.

The stack and speed snapshot appears on the result page, in the email, and in the desk.

**On screen.** Polar sends the buyer to `/paid?checkout_id=…` (set as the checkout link's success URL). That page polls `/api/status`, which finds the order for the checkout and answers `working`, `ready` (with the `/v/<id>` link, which the page opens), or `refunded`. The access token needs `orders:read` and `refunds:write`.

**Ask AI** in the composer makes or remakes a draft by hand, which is also how to stamp orders that came in before the webhook was set up.

Env vars:
- `ANTHROPIC_API_KEY`: from console.anthropic.com. A draft costs a few cents.
- `POLAR_WEBHOOK_SECRET`: Polar → Settings → Webhooks → add endpoint `https://stampmypage.com/api/polar-webhook`, format Raw, event `order.paid`, then copy its secret here.
- `MICROLINK_API_KEY` (optional): without it, Microlink's free tier allows about 50 screenshots a day, which is about 25 orders (two screenshots each).
- `STAMP_MODE` (optional): `auto` or `review` (default).

### Analytics

The desk's **Analytics** tab covers the last 7, 30, or 90 days:

- **Traffic** (needs Upstash Redis): visitors (once per day), page views, the funnel from homepage to form to checkout, form errors, countries, devices, sites sending visitors (add `?ref=name` to links you post), where stamps get opened, links copied to post, and people coming back from a stamp.
- **Business** (needs Polar; verdicts and turnaround also need Blob): paid orders, revenue after refunds, refunds, average order, verdict mix, and time from payment to published stamp.

Counting is anonymous and cookieless: no IPs are stored, a visitor is a hash that changes daily, visitors with Global Privacy Control or Do Not Track aren't counted, and counts expire after about a year. The privacy page says so. `/api/track` accepts events from anyone, so treat counts as a guide, not an audit.

Per order: **Stamp**, paste or drop the first-screen screenshot, mark it up, pick DEAD / COPE / ALIVE, write one sentence, **Publish verdict**.

The editor: **Circle** draws a marker ring, **Pen** draws freehand, S / M / L sets the marker size. Click a mark to select it, drag to move it, pull a corner to resize a circle. Drag the stamp to move it. Undo with Ctrl+Z, redo with Ctrl+Shift+Z, Delete removes the selected mark. Publishing again replaces the stamp at the same link. Without Resend set up, publishing still works; use **Draft email** to send the link yourself.

Result-page buttons come from `offers` in `src/config.js`: Resurrection and Kill Sheet for DEAD, Kill Sheet for COPE, Stay Alive for ALIVE. An empty link hides its button.

Stamped screenshots and verdicts are public files in Blob storage. Customer emails are not stored there.

## Security, SEO, and speed

- Security headers (CSP, frame blocking, nosniff, referrer and permissions policies) are in `vercel.json`. The CSP allows only this site, plus stamped images from Vercel Blob. Fonts are self-hosted in `public/fonts`, so no third party is involved.
- Page URLs are checked by `src/url.js` in the form, the admin desk, and the publish API. It rejects credentials, IP addresses, ports, and non-public names, and keeps only origin plus path (plus the `?id=` on Google Play links).
- The homepage is plain HTML, so crawlers read the whole page. Its script is about 6 KB gzipped. React loads only on the result and payment pages.
- `robots.txt` and `sitemap.xml` are generated at build. Preview deployments disallow all crawling. Private pages are not listed in robots.txt; `/admin`, `/paid`, and `/v/` send `noindex` headers instead.
- The admin API blocks an IP for 15 minutes after 5 wrong keys, and slows every wrong guess. The count is kept per server instance, so for a hard global limit add a Vercel Firewall rate-limit rule on `/api/orders` and `/api/publish`.
- Hashed assets and fonts are cached for a year.
- `/privacy` and `/terms` are short, plain pages. Review them before launch: the refund line and the "keep until you ask" retention are policy choices for you to confirm.

## Box and React Bits

Box, the desk cat, lives in `src/mascot.js`. The name is `NAME` there. On the homepage Box jumps out of the box, walks the desk, sits, and hops back in (`src/roam.js`). When a visitor clicks into the form, types, or reaches for the button, Box runs home and watches. Box wanders off again a few seconds after they leave the form.

The result and payment pages use [React Bits](https://reactbits.dev) components, copied into `src/bits/`. See [src/bits/README.md](src/bits/README.md). The homepage uses small plain-JavaScript ports of the same effects (decrypt, magnet, click spark) in `src/home.js` to stay light. Everything holds still for visitors with reduced motion turned on, and all content is visible without scrolling or JavaScript animation.

## Brand

The ink roundel (concept 01) is generated by `scripts/brand/build.mjs`: run `node scripts/brand/build.mjs` after changing colours or wording. It writes the icons, lockups and red seal to `public/brand/`, plus the favicons (`favicon.svg`, `favicon.ico`, 16 and 32 px PNGs), `apple-touch-icon.png`, the 192 and 512 app icons, `site.webmanifest`, and the 1200×630 `og-image-1200x630.png` to `public/`. Brand ink is `#4B2EE0` on lavender `#F4F1FF`, and the seal is red `#B42228`. The share cards draw the red seal from `public/brand/smp-seal-red-256.png`. Fonts for the script are in `scripts/brand/fonts` (OFL).
