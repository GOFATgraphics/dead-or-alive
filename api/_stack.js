// The tech stack, from evidence only. Every entry names the fact that proves it: a response header, a script
// the page loads, a marker in its HTML, a cookie it sets, a tool running in the browser, or its address.
// Nothing is listed on a hunch, and an entry is listed once, with its first piece of evidence.
//
// Inputs: { url, html, headers, cookies, generator, scripts, resources, globals, frameworks }
//   html/headers/cookies/generator come from our own request (_inspect.js), when the site allows it;
//   scripts/resources/globals/frameworks come from the screenshot browser (public/measure.js).
// Output: [{ name, category, evidence }], in category order.

export const CATEGORIES = [
  "Built with", "Framework", "Hosting & CDN", "Server", "Analytics", "Ads & pixels", "Payments", "Auth & backend",
  "Support & chat", "Email & forms", "Scheduling", "Monitoring", "Testing & experiments", "UI & libraries", "Fonts",
  "Video", "Reviews", "Cookie consent",
];

// [name, category, { host, header: [name, re], html, script, cookie, global, fw, generator }]
// `script` is matched against every script and resource URL the page loaded; `html` against the page's own HTML.
const R = [
  // Built with: AI app builders, site builders, CMSs.
  ["Lovable", "Built with", { host: /\.lovable\.app$|\.lovableproject\.com$/, html: /cdn\.gpteng\.co|gptengineer\.js|lovable-tagger/, generator: /lovable/i }],
  ["Bolt", "Built with", { host: /\.bolt\.host$|\.bolt\.new$/, html: /made (?:with|in) bolt|bolt\.new\//i }],
  ["v0", "Built with", { host: /\.vusercontent\.net$|\.v0\.app$/, generator: /\bv0\b/i }],
  ["Replit", "Built with", { host: /\.replit\.app$|\.repl\.co$|\.replit\.dev$/, script: /replit\.com\/public\/js/ }],
  ["Base44", "Built with", { host: /\.base44\.app$/, script: /base44/ }],
  ["Framer", "Built with", { html: /framerusercontent\.com|data-framer-/, generator: /framer/i, header: ["server", /framer/i] }],
  ["Webflow", "Built with", { html: /data-wf-page|data-wf-site/, script: /website-files\.com|webflow\.js/, generator: /webflow/i, global: "Webflow" }],
  ["Wix", "Built with", { html: /static\.wixstatic\.com|wix-thunderbolt/, header: ["x-wix-request-id", /./], generator: /wix/i }],
  ["Squarespace", "Built with", { html: /static1\.squarespace\.com|squarespace-cdn/, global: "Squarespace", generator: /squarespace/i }],
  ["Shopify", "Built with", { html: /cdn\.shopify\.com|Shopify\.theme/, header: ["x-shopid", /./], global: "Shopify" }],
  ["WordPress", "Built with", { html: /\/wp-content\/|\/wp-includes\//, generator: /wordpress/i }],
  ["Ghost", "Built with", { generator: /ghost/i, html: /ghost-portal|\/ghost\/api\// }],
  ["Bubble", "Built with", { html: /_bubble_page_load|\.bubble\.io\//, script: /bubble\.io/ }],
  ["Carrd", "Built with", { html: /carrd\.co/, generator: /carrd/i }],
  ["Notion", "Built with", { html: /notion\.site|notion-static\.com/, host: /\.notion\.site$/ }],
  ["Super", "Built with", { html: /super\.so/ }],
  ["Softr", "Built with", { html: /softr\.io|softr-files/ }],
  ["Durable", "Built with", { html: /durable\.co/ }],
  ["Hostinger Website Builder", "Built with", { html: /zyrosite\.com|zyro\.com/ }],
  ["HubSpot CMS", "Built with", { generator: /hubspot/i, header: ["x-hs-cache-config", /./] }],
  ["Unbounce", "Built with", { html: /unbounce\.com|ub-emb/ }],
  ["Leadpages", "Built with", { html: /leadpages\.(?:net|co)/ }],
  ["ClickFunnels", "Built with", { html: /clickfunnels\.com/ }],
  ["Systeme.io", "Built with", { html: /systeme\.io/ }],
  ["Kajabi", "Built with", { html: /kajabi-cdn\.com|kajabi\.com/ }],
  ["Teachable", "Built with", { html: /teachablecdn\.com/ }],
  ["Gumroad", "Built with", { host: /\.gumroad\.com$/ }],
  ["Substack", "Built with", { html: /substackcdn\.com/, host: /\.substack\.com$/ }],
  ["Beehiiv", "Built with", { html: /beehiiv\.com/, host: /\.beehiiv\.com$/ }],

  // Framework.
  ["Next.js", "Framework", { html: /__NEXT_DATA__|\/_next\/static\//, header: ["x-powered-by", /next\.js/i], global: "__NEXT_DATA__", script: /\/_next\/static\// }],
  ["Nuxt", "Framework", { html: /__NUXT__|\/_nuxt\//, global: "__NUXT__", script: /\/_nuxt\// }],
  ["Remix", "Framework", { html: /__remixContext|__reactRouterContext/, global: "__remixContext" }],
  ["Astro", "Framework", { html: /astro-island|\/_astro\//, generator: /astro/i, script: /\/_astro\// }],
  ["SvelteKit", "Framework", { html: /__sveltekit|\/_app\/immutable\//, script: /\/_app\/immutable\// }],
  ["Gatsby", "Framework", { html: /___gatsby|gatsby-/, generator: /gatsby/i, global: "___gatsby" }],
  ["Angular", "Framework", { html: /ng-version=/, fw: "angular" }],
  ["Vite", "Framework", { html: /\/@vite\/client|\/assets\/index-[\w-]{6,}\.js/, script: /\/assets\/index-[\w-]{6,}\.js/ }],
  ["React", "Framework", { fw: "react", html: /data-reactroot/ }],
  ["Vue", "Framework", { fw: "vue", html: /data-v-app|data-server-rendered/ }],
  ["Svelte", "Framework", { fw: "svelte" }],
  ["Qwik", "Framework", { fw: "qwik", html: /q:container/ }],
  ["Laravel", "Framework", { cookie: /^laravel_session$/ }],
  ["Ruby on Rails", "Framework", { html: /name=["']csrf-param["'][^>]*authenticity_token/, cookie: /^_[\w-]+_session$/ }],
  ["Django", "Framework", { html: /csrfmiddlewaretoken/ }],
  ["PHP", "Framework", { header: ["x-powered-by", /php/i], cookie: /^PHPSESSID$/ }],
  ["Express", "Framework", { header: ["x-powered-by", /express/i] }],
  ["ASP.NET", "Framework", { header: ["x-powered-by", /asp\.net/i], cookie: /^ASP\.NET_SessionId$/ }],

  // Hosting & CDN.
  ["Vercel", "Hosting & CDN", { header: ["x-vercel-id", /./], host: /\.vercel\.app$/, script: /\/_vercel\// }],
  ["Netlify", "Hosting & CDN", { header: ["x-nf-request-id", /./], host: /\.netlify\.app$/ }],
  ["Cloudflare", "Hosting & CDN", { header: ["cf-ray", /./], host: /\.pages\.dev$/ }],
  ["Amazon CloudFront", "Hosting & CDN", { header: ["x-amz-cf-id", /./] }],
  ["Fastly", "Hosting & CDN", { header: ["x-fastly-request-id", /./] }],
  ["Fly.io", "Hosting & CDN", { header: ["fly-request-id", /./], host: /\.fly\.dev$/ }],
  ["Render", "Hosting & CDN", { header: ["rndr-id", /./], host: /\.onrender\.com$/ }],
  ["Railway", "Hosting & CDN", { header: ["x-railway-request-id", /./], host: /\.up\.railway\.app$/ }],
  ["GitHub Pages", "Hosting & CDN", { header: ["x-github-request-id", /./], host: /\.github\.io$/ }],
  ["Firebase Hosting", "Hosting & CDN", { host: /\.web\.app$|\.firebaseapp\.com$/ }],
  ["Heroku", "Hosting & CDN", { header: ["via", /vegur/i], host: /\.herokuapp\.com$/ }],
  ["Google Cloud", "Hosting & CDN", { header: ["server", /google frontend/i] }],
  ["Akamai", "Hosting & CDN", { header: ["server", /akamai/i] }],
  ["Microsoft Azure", "Hosting & CDN", { header: ["x-azure-ref", /./] }],
  ["DigitalOcean", "Hosting & CDN", { header: ["x-do-app-origin", /./], host: /\.ondigitalocean\.app$/ }],
  ["Shopify CDN", "Hosting & CDN", { script: /cdn\.shopify\.com/ }],

  // Server software.
  ["nginx", "Server", { header: ["server", /nginx/i] }],
  ["Apache", "Server", { header: ["server", /apache/i] }],
  ["LiteSpeed", "Server", { header: ["server", /litespeed/i] }],
  ["Caddy", "Server", { header: ["server", /caddy/i] }],
  ["OpenResty", "Server", { header: ["server", /openresty/i] }],
  ["IIS", "Server", { header: ["server", /microsoft-iis/i] }],

  // Analytics.
  ["Google Analytics", "Analytics", { script: /google-analytics\.com|googletagmanager\.com\/gtag\/js\?id=G-/, html: /gtag\('config',\s*'G-/ }],
  ["Google Tag Manager", "Analytics", { script: /googletagmanager\.com\/gtm\.js/, html: /GTM-[A-Z0-9]{4,}/, global: "google_tag_manager" }],
  ["Vercel Analytics", "Analytics", { script: /\/_vercel\/insights|va\.vercel-scripts\.com/ }],
  ["Vercel Speed Insights", "Analytics", { script: /\/_vercel\/speed-insights/ }],
  ["Plausible", "Analytics", { script: /plausible\.io\/js/, global: "plausible" }],
  ["Fathom", "Analytics", { script: /cdn\.usefathom\.com/, global: "fathom" }],
  ["PostHog", "Analytics", { script: /posthog\.com|i\.posthog/, global: "posthog" }],
  ["Mixpanel", "Analytics", { script: /cdn\.mxpnl\.com|mixpanel/, global: "mixpanel" }],
  ["Amplitude", "Analytics", { script: /cdn\.amplitude\.com|amplitude\.com\/libs/, global: "amplitude" }],
  ["Segment", "Analytics", { script: /cdn\.segment\.com/ }],
  ["Heap", "Analytics", { script: /heapanalytics\.com/, global: "heap" }],
  ["Hotjar", "Analytics", { script: /static\.hotjar\.com/, global: "hj" }],
  ["Microsoft Clarity", "Analytics", { script: /clarity\.ms/, global: "clarity" }],
  ["Umami", "Analytics", { script: /umami/, global: "umami" }],
  ["Simple Analytics", "Analytics", { script: /simpleanalyticscdn\.com|scripts\.simpleanalytics/, global: "sa_event" }],
  ["Matomo", "Analytics", { script: /matomo\.js|piwik\.js/, global: "_paq" }],
  ["Pirsch", "Analytics", { script: /pirsch\.io/, global: "pirsch" }],

  // Ads & pixels.
  ["Meta Pixel", "Ads & pixels", { script: /connect\.facebook\.net\/.*fbevents/, global: "fbq" }],
  ["LinkedIn Insight", "Ads & pixels", { script: /snap\.licdn\.com/, global: "_linkedin_partner_id" }],
  ["TikTok Pixel", "Ads & pixels", { script: /analytics\.tiktok\.com/, global: "ttq" }],
  ["X (Twitter) Pixel", "Ads & pixels", { script: /static\.ads-twitter\.com/, global: "twq" }],
  ["Reddit Pixel", "Ads & pixels", { script: /redditstatic\.com\/ads/, global: "rdt" }],
  ["Google Ads", "Ads & pixels", { script: /googleadservices\.com|googletagmanager\.com\/gtag\/js\?id=AW-/ }],
  ["Microsoft Ads", "Ads & pixels", { script: /bat\.bing\.com/, global: "uetq" }],

  // Payments.
  ["Stripe", "Payments", { script: /js\.stripe\.com/, global: "Stripe", html: /buy\.stripe\.com\// }],
  ["Paddle", "Payments", { script: /cdn\.paddle\.com/, global: "Paddle" }],
  ["Lemon Squeezy", "Payments", { script: /lemonsqueezy\.com/, global: "LemonSqueezy", html: /\.lemonsqueezy\.com\/checkout/ }],
  ["Polar", "Payments", { html: /buy\.polar\.sh\/|polar\.sh\/checkout/ }],
  ["Gumroad", "Payments", { script: /gumroad\.com\/js/, html: /gumroad\.com\/l\/|gum\.co\// }],
  ["PayPal", "Payments", { script: /paypal\.com\/sdk/, global: "paypal" }],
  ["Chargebee", "Payments", { script: /chargebee\.com/, global: "Chargebee" }],

  // Auth & backend.
  ["Clerk", "Auth & backend", { script: /clerk\.[\w.-]+\.(?:com|dev)|clerk\.browser/, global: "Clerk", cookie: /^__(?:client|session)(?:_uat)?$/ }],
  ["Supabase", "Auth & backend", { script: /supabase\.co/, html: /\.supabase\.co/, global: "supabase" }],
  ["Firebase", "Auth & backend", { script: /firebasejs|firebaseio\.com|firebaseapp\.com/, global: "firebase" }],
  ["Auth0", "Auth & backend", { script: /auth0\.com|cdn\.auth0/, global: "auth0" }],
  ["Convex", "Auth & backend", { script: /convex\.cloud/, html: /\.convex\.cloud/ }],
  ["Appwrite", "Auth & backend", { script: /appwrite/ }],
  ["Memberstack", "Auth & backend", { script: /memberstack/, global: "$memberstackDom" }],
  ["Outseta", "Auth & backend", { script: /outseta\.com/, global: "Outseta" }],

  // Support & chat.
  ["Intercom", "Support & chat", { script: /widget\.intercom\.io|intercomcdn/, global: "Intercom" }],
  ["Crisp", "Support & chat", { script: /client\.crisp\.chat/, global: "$crisp" }],
  ["Drift", "Support & chat", { script: /js\.driftt\.com/, global: "drift" }],
  ["Zendesk", "Support & chat", { script: /static\.zdassets\.com/, global: "zE" }],
  ["Tawk.to", "Support & chat", { script: /embed\.tawk\.to/, global: "Tawk_API" }],
  ["Tidio", "Support & chat", { script: /code\.tidio\.co/, global: "tidioChatApi" }],
  ["Help Scout", "Support & chat", { script: /beacon-v2\.helpscout/ }],
  ["Chatwoot", "Support & chat", { script: /chatwoot/, global: "chatwootSDK" }],
  ["HubSpot", "Support & chat", { script: /js\.hs-scripts\.com|js\.hsforms\.net|js\.hs-analytics\.net/, global: "_hsq" }],

  // Email & forms.
  ["Mailchimp", "Email & forms", { script: /chimpstatic\.com/, html: /list-manage\.com/ }],
  ["Kit (ConvertKit)", "Email & forms", { script: /convertkit\.com|ck\.page|kit\.com\/.*\.js/, html: /app\.convertkit\.com\/forms/ }],
  ["Klaviyo", "Email & forms", { script: /klaviyo\.com/, global: "_learnq" }],
  ["Beehiiv form", "Email & forms", { html: /embeds\.beehiiv\.com/ }],
  ["Typeform", "Email & forms", { script: /embed\.typeform\.com/, html: /form\.typeform\.com/ }],
  ["Tally", "Email & forms", { script: /tally\.so/, html: /tally\.so\/(?:r|embed)\// }],
  ["Formspree", "Email & forms", { html: /formspree\.io\/f\// }],
  ["Jotform", "Email & forms", { html: /jotform\.com/ }],
  ["Fillout", "Email & forms", { html: /fillout\.com/ }],

  // Scheduling.
  ["Calendly", "Scheduling", { script: /assets\.calendly\.com/, html: /calendly\.com\// }],
  ["Cal.com", "Scheduling", { script: /app\.cal\.com\/embed|cal\.com\/embed/, html: /cal\.com\// }],
  ["SavvyCal", "Scheduling", { html: /savvycal\.com\// }],

  // Monitoring.
  ["Sentry", "Monitoring", { script: /sentry-cdn\.com|ingest\.sentry\.io|\.sentry\.io\/api/, global: "Sentry" }],
  ["LogRocket", "Monitoring", { script: /cdn\.logrocket\.io|logr-ingest/, global: "LogRocket" }],
  ["Datadog RUM", "Monitoring", { script: /datadoghq-browser-agent|browser-intake-datadoghq/, global: "DD_RUM" }],
  ["Bugsnag", "Monitoring", { script: /bugsnag/, global: "Bugsnag" }],

  // Testing & experiments.
  ["Optimizely", "Testing & experiments", { script: /cdn\.optimizely\.com/, global: "optimizely" }],
  ["VWO", "Testing & experiments", { script: /visualwebsiteoptimizer\.com/, global: "_vwo_code" }],

  // UI & libraries.
  ["Tailwind CSS", "UI & libraries", { fw: "tailwind", script: /cdn\.tailwindcss\.com/ }],
  ["Bootstrap", "UI & libraries", { script: /bootstrap(?:\.bundle)?(?:\.min)?\.(?:js|css)/, html: /bootstrap(?:\.min)?\.css/ }],
  ["jQuery", "UI & libraries", { script: /jquery(?:[.-]\d[\w.]*)?(?:\.min)?\.js/, global: "jQuery" }],
  ["GSAP", "UI & libraries", { script: /gsap/, global: "gsap" }],
  ["Three.js", "UI & libraries", { script: /three(?:\.module)?(?:\.min)?\.js/, global: "THREE" }],
  ["Alpine.js", "UI & libraries", { script: /alpinejs/, global: "Alpine" }],
  ["htmx", "UI & libraries", { script: /htmx(?:\.min)?\.js|unpkg\.com\/htmx/, global: "htmx" }],
  ["Lottie", "UI & libraries", { script: /lottie/, global: "lottie" }],
  ["Swiper", "UI & libraries", { script: /swiper/, global: "Swiper" }],
  ["Lenis", "UI & libraries", { script: /lenis/, global: "Lenis" }],
  ["Font Awesome", "UI & libraries", { script: /fontawesome|kit\.fontawesome\.com/, html: /font-awesome|fontawesome/ }],

  // Fonts (the families actually in use are listed separately, from the browser).
  ["Google Fonts", "Fonts", { script: /fonts\.googleapis\.com|fonts\.gstatic\.com/, html: /fonts\.googleapis\.com/ }],
  ["Adobe Fonts", "Fonts", { script: /use\.typekit\.net/, html: /use\.typekit\.net/ }],
  ["Bunny Fonts", "Fonts", { script: /fonts\.bunny\.net/, html: /fonts\.bunny\.net/ }],

  // Video.
  ["YouTube embed", "Video", { script: /youtube\.com\/(?:embed|iframe_api)|youtube-nocookie\.com/, html: /youtube\.com\/embed\/|youtube-nocookie\.com\/embed/ }],
  ["Vimeo", "Video", { script: /player\.vimeo\.com/, html: /player\.vimeo\.com/ }],
  ["Wistia", "Video", { script: /fast\.wistia\.(?:com|net)/, global: "_wq" }],
  ["Loom", "Video", { html: /loom\.com\/embed\// }],
  ["Mux", "Video", { script: /mux\.com|stream\.mux/ }],

  // Reviews & social proof.
  ["Trustpilot", "Reviews", { script: /widget\.trustpilot\.com/, global: "Trustpilot" }],
  ["Senja", "Reviews", { script: /senja\.io/ }],
  ["Testimonial.to", "Reviews", { html: /testimonial\.to\// }],

  // Cookie consent.
  ["OneTrust", "Cookie consent", { script: /cdn\.cookielaw\.org|onetrust/, global: "OneTrust" }],
  ["Cookiebot", "Cookie consent", { script: /consent\.cookiebot\.com/, global: "Cookiebot" }],
  ["Usercentrics", "Cookie consent", { script: /usercentrics/, global: "UC_UI" }],
  ["Didomi", "Cookie consent", { script: /sdk\.privacy-center\.org|didomi/, global: "Didomi" }],
  ["Termly", "Cookie consent", { script: /app\.termly\.io/ }],
  ["iubenda", "Cookie consent", { script: /iubenda\.com/, global: "_iub" }],
  ["CookieYes", "Cookie consent", { script: /cookieyes\.com/ }],
  ["Osano", "Cookie consent", { script: /osano\.com/, global: "Osano" }],
];

const shortUrl = (u) => {
  try {
    const x = new URL(u);
    const path = x.pathname.length > 32 ? x.pathname.slice(0, 31) + "…" : x.pathname;
    return x.hostname.replace(/^www\./, "") + (path === "/" ? "" : path);
  } catch (_) {
    return String(u).slice(0, 48);
  }
};

function evidenceFor(rule, input) {
  const { host, header, html, script, cookie, global, fw, generator } = rule;
  if (host && host.test(input.host)) return `Address: ${input.host}`;
  if (header) {
    const v = input.headers[header[0]];
    if (v && header[1].test(v)) return header[0] === "server" || header[0] === "x-powered-by" || header[0] === "via" ? `Header ${header[0]}: ${String(v).slice(0, 40)}` : `Header ${header[0]}`;
  }
  if (generator && input.generator && generator.test(input.generator)) return `Generator tag: ${input.generator.slice(0, 40)}`;
  if (script) {
    const hit = input.urls.find((u) => script.test(u));
    if (hit) return `Loads ${shortUrl(hit)}`;
  }
  if (global && input.globals.has(global)) return `Running on the page: window.${global}`;
  if (fw && input.frameworks.has(fw)) return fw === "tailwind" ? "Tailwind's CSS variables are on the page" : `${fw[0].toUpperCase() + fw.slice(1)} markers on the rendered page`;
  if (cookie) {
    const c = input.cookies.find((n) => cookie.test(n));
    if (c) return `Sets cookie ${c}`;
  }
  if (html) {
    const m = input.html.match(html);
    if (m) return `In the page's code: ${m[0].replace(/\s+/g, " ").slice(0, 40)}`;
  }
  return "";
}

export function detectStack({ url = "", html = "", headers = {}, cookies = [], generator = "", scripts = [], resources = [], globals = [], frameworks = [] }) {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch (_) {}
  const lower = Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  // Script URLs from the HTML itself, plus what the browser actually loaded.
  const fromHtml = [...String(html).matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/gi)].map((m) => m[1]);
  const input = {
    host,
    headers: lower,
    cookies,
    generator: String(generator || ""),
    html: String(html),
    urls: [...new Set([...fromHtml, ...scripts, ...resources].filter(Boolean))],
    globals: new Set(globals),
    frameworks: new Set(frameworks),
  };
  const found = [];
  for (const [name, category, rule] of R) {
    const evidence = evidenceFor(rule, input);
    if (evidence) found.push({ name, category, evidence });
  }
  // React underneath Next.js, Remix or Gatsby is implied; list only the framework that says more.
  const names = new Set(found.map((f) => f.name));
  const out = found.filter((f) => !(f.name === "React" && ["Next.js", "Remix", "Gatsby"].some((n) => names.has(n))) && !(f.name === "Vue" && names.has("Nuxt")) && !(f.name === "Svelte" && names.has("SvelteKit")));
  return out.sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category));
}
