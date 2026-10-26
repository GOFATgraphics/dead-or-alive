# Stamp My Page

Is your page dead or alive? Website, web app, SaaS, or app store page: we stamp its first screen DEAD, COPE, or ALIVE.

First screen. Five seconds. One stamp. Free.

## How a stamp runs

No checkout, no account, no AI. The homepage form posts the URL to `/api/stamp`, which answers with a random job id and, in the background:

1. screenshots the first screen with Microlink and reads its rendered headline and button labels ([api/_shot.js](api/_shot.js)),
2. loads the page once for speed, size, https, and tags ([api/_inspect.js](api/_inspect.js)),
3. scores 13 weighted checks ([api/_rules.js](api/_rules.js)): headline present, plain English (no pitch-deck words), short, says who it's for, a clear next step, buttons that don't compete, speed, weight, phone viewport, https, title, description, share preview. 80+ with a plain headline is ALIVE, 55+ is COPE, the rest DEAD. The sentence comes from the most important failed check.
4. draws and publishes the stamp at `/v/<id>` ([api/_stamp.js](api/_stamp.js)).

The homepage polls `/api/status?job=` and opens the stamp in about a minute. If the page can't be captured after one retry, the homepage says so and nothing is published. App Store and Google Play links are refused for now.

Needed in Vercel: a **Blob** store (`BLOB_READ_WRITE_TOKEN`). Optional: `MICROLINK_API_KEY` (the free tier allows about 50 screenshots a day).

## The offers

The result page shows every check with its fix, then sells the follow-up: the **Kill Sheet** ($19) first after a DEAD or COPE, **Stay Alive** ($20/month) first after an ALIVE. Prices appear only there, after a stamp; the homepage never shows them.

1. In Polar, create both products. Give each a required custom field with slug `page_url` (the result page fills it in).
2. Paste their checkout links into `offers` in [src/config.js](src/config.js). Until a link is there, its button opens an email to `contact` instead.
3. Success URLs: Kill Sheet → `https://<your-domain>/paid/sheet`, Stay Alive → `https://<your-domain>/paid/alive`.

You deliver the Kill Sheet and run Stay Alive yourself for now; paid orders show in `/admin` once `POLAR_ACCESS_TOKEN` is set.

Free stamps cost screenshots, so they're limited:

- `STAMP_IP_LIMIT`: stamps per visitor per day (default 5).
- `STAMP_DAILY_LIMIT`: stamps for the whole site per day (default 300).
- Connect Upstash Redis (below) so these counts are shared across function instances. Without it they're per instance, which slows abuse but doesn't stop it.

To pause stamping by hand, set `queueOpen` to `false` in [src/config.js](src/config.js).

Deploy on Vercel from this repo. Vercel runs `npm run build` (Vite) and serves `dist/`. Locally: `npm install`, then `npm run dev`.

## Admin desk and result pages

`/admin` is the back room: visitor analytics (including offer clicks), setup status, and Polar orders. Free stamps don't appear in its order list; they publish straight to `/v/<id>`. Shared links show the stamp as their preview image.

1. In Vercel, add **Blob** storage to the project (Storage tab). It sets `BLOB_READ_WRITE_TOKEN`.
2. In Polar, create an organization access token with `orders:read`, so Kill Sheet and Stay Alive orders show in the desk.
3. Optional, for desk emails: in [Resend](https://resend.com), verify your sending domain and create an API key.
4. In Vercel project env vars, set:
   - `ADMIN_KEY`: the password for `/admin`. At least 32 characters, random. Make one with `openssl rand -base64 36`. Without it (or if it's shorter), the admin API answers 503.
   - `POLAR_ACCESS_TOKEN`: the token from step 2.
   - `RESEND_API_KEY` and `MAIL_FROM` (for example `Stamp My Page <stamps@stampmypage.com>`).
   - `SITE_URL`: your domain, for example `https://stampmypage.com`. Emails, canonical links, share tags, robots.txt, and the sitemap use it. Without it, the build falls back to Vercel's production domain.
   - `CONTACT_EMAIL`: the address shown on the privacy and terms pages for deletion requests and questions.
   - `POLAR_VERDICT_PRODUCT_ID`: the Verdict product's ID, so only its orders show in the desk, queue, and analytics (other products in the same Polar organization are ignored); `POLAR_ORGANIZATION_ID`; `POLAR_API_BASE=https://sandbox-api.polar.sh` for sandbox; `RESULT_SECRET` so result links do not change if you rotate `ADMIN_KEY`.
   - Optional: Upstash Redis from the Vercel Marketplace (Storage → Upstash) for visitor analytics and shared daily stamp limits. It adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
5. Redeploy. Open `/admin` and enter the key.

Only `ADMIN_KEY` is needed to open the desk. Everything else lights up as it's connected; the **Setup** tab shows what's in and what's missing.

### What a stamp checks

The first screen only.

The form reads the link as the visitor types (`pageKind` in `src/url.js`) and says what will be stamped:
- `apps.apple.com` / `play.google.com/store/apps`: refused for now, with a note to send the app's website.
- `app.`, `dashboard.`, `/login`, `/dashboard` and similar: a warning that only the logged-out view gets stamped.
- Installer files (`.dmg`, `.exe`, `.apk`, ...): refused, with a note to send the download page.
- Anything else: the first screen of the page.

### Share cards

Publishing a stamp (by hand or automatically) also draws two share cards on the server (`api/_card.js`):

- **Wide, 1200×630**: a flat white card with a verdict-coloured rule, the brand, the circled first screen (left uncovered), the verdict badge, the sentence in quotes, and the domain, date, stamp number (#0042), and stampmypage.com. It's the link preview (`og:image`, `twitter:image`) for `/v/<id>`, so a pasted link shows the card on X, LinkedIn, Slack, and iMessage.
- **Square, 1080×1080** for Instagram and LinkedIn posts.

They're stored in Blob next to the stamp (`verdicts/<id>-card.jpg`, `-square.jpg`). The result page shows the card with **Share on X**, **Share on LinkedIn**, **Download card**, and **Square for Instagram** (`/api/card?id=…&size=wide|square`). DEAD results lead with "Not ready to post a DEAD?" and a **See how to fix it** button that jumps to the offers.

Stamp numbers count up with Redis (`stamp:number`) and fall back to the number of published stamps. Republishing keeps the number. The card's bold type uses `server-fonts/` (Plus Jakarta Sans Bold and ExtraBold, OFL) and the mark from `public/brand/smp-mark.png`, both bundled only with the functions that draw.

### AI drafts (desk only, optional)

Free stamps never use AI. In the desk, **Ask AI** on a Polar order can still make a draft with Claude (screenshot, verdict, sentence, circles) for you to edit and publish by hand. It needs `ANTHROPIC_API_KEY`; without it, stamp by hand in the editor.

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

## Homepage design

The homepage has its own stylesheet, `src/home.css`: warm paper, black ink, verdict red for the main action, and IBM Plex Mono for labels and meta lines. Two corner radii (4px, 12px) and hairline borders; only the stamp cards cast a shadow. The other pages still use `src/styles.css`.

The stamp cards on the homepage (hero and the before-and-after) are HTML and CSS, sized in `em` so one `font-size` scales each card. They show acme-notes.app, which is fictional and labelled as such on the page. Kill Sheet and Stay Alive are listed in the pricing section with a "Coming soon" button until their checkouts exist.

## Box and React Bits

Box, the desk cat, lives in `src/mascot.js`. The name is `NAME` there. Box appears on the result and payment pages; the homepage doesn't use Box.

The result and payment pages use [React Bits](https://reactbits.dev) components, copied into `src/bits/`. See [src/bits/README.md](src/bits/README.md). The homepage uses small plain-JavaScript ports of the same effects (decrypt, magnet, click spark) in `src/home.js` to stay light. Everything holds still for visitors with reduced motion turned on, and all content is visible without scrolling or JavaScript animation.

## Brand

The ink roundel (concept 01) is generated by `scripts/brand/build.mjs`: run `node scripts/brand/build.mjs` after changing colours or wording. It writes the icons, lockups and red seal to `public/brand/`, plus the favicons (`favicon.svg`, `favicon.ico`, 16 and 32 px PNGs), `apple-touch-icon.png`, the 192 and 512 app icons, `site.webmanifest`, and the 1200×630 `og-image-1200x630.png` to `public/`. Brand ink is `#4B2EE0` on lavender `#F4F1FF`, and the seal is red `#B42228`. The share cards draw the red seal from `public/brand/smp-seal-red-256.png`. Fonts for the script are in `scripts/brand/fonts` (OFL).
