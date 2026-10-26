/* Stamp My Page: runs inside the page being stamped, in the screenshot browser. It measures and records facts,
   never changes the page, and leaves them on <html data-smp> for the screenshot service to read back:
   - where the headline's text and the visible buttons sit (for the marker circles),
   - the line under the headline,
   - which tools are running (window globals and real framework markers),
   - real performance numbers from the browser (time to first byte, largest contentful paint, layout shift,
     requests, bytes by type) and the third-party hosts the page loaded,
   - the font families actually in use.
   It measures a few times, for pages that build late. */
(function () {
  var BUTTONS = 'button, [role="button"], a[class*="btn"], a[class*="button"], a[class*="cta"], input[type="submit"]';
  // Globals that only exist when a tool is really running on the page. Generic names that any site might use are left out.
  var GLOBALS = [
    "__NEXT_DATA__", "__NUXT__", "$nuxt", "__remixContext", "__reactRouterContext", "__sveltekit_dev", "__SVELTEKIT_PAYLOAD__",
    "___gatsby", "Shopify", "wp", "Webflow", "__framer_importFromPackage", "wixBiSession", "Squarespace",
    "gtag", "dataLayer", "google_tag_manager", "fbq", "_linkedin_partner_id", "ttq", "twq", "rdt", "uetq", "posthog", "mixpanel",
    "amplitude", "heap", "plausible", "fathom", "umami", "sa_event", "clarity", "hj", "_hsq", "HubSpotConversations", "_paq", "pirsch",
    "Intercom", "$crisp", "drift", "zE", "Tawk_API", "tidioChatApi", "Beacon", "chatwootSDK", "fcWidget",
    "Stripe", "Paddle", "LemonSqueezy", "createLemonSqueezy", "Chargebee", "paypal", "GumroadOverlay",
    "Sentry", "LogRocket", "DD_RUM", "bugsnag", "Bugsnag",
    "Clerk", "supabase", "firebase", "auth0", "MemberStack", "$memberstackDom", "Outseta",
    "Calendly", "Cal", "Typeform", "Tally", "jQuery", "gsap", "THREE", "Alpine", "htmx", "Turbo", "Stimulus", "Lenis", "lottie",
    "Swiper", "Splide", "AOS", "Vimeo", "YT", "Wistia", "_wq", "lucide", "Vue", "__VUE__", "angular", 
    "OneTrust", "Cookiebot", "UC_UI", "__tcfapi", "Didomi", "Osano", "iubenda", "_iub", "klaviyo", "_learnq", "convertkit",
    "optimizely", "VWO", "_vwo_code", "Trustpilot", "senja", "__vercel_insights"
  ];

  function box(b, W, H) {
    if (!b || !b.width || !b.height || b.bottom < 0 || b.top > H || b.right < 0 || b.left > W) return null;
    return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)];
  }
  var text = function (el) { return ((el && (el.innerText || el.textContent)) || "").replace(/\s+/g, " ").trim(); };

  // The first block of text after the headline: usually the subhead.
  function subhead(h) {
    if (!h) return "";
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    walker.currentNode = h;
    var n, seen = 0;
    while ((n = walker.nextNode()) && seen < 60) {
      seen++;
      if (h.contains(n)) continue;
      if (/^(P|H2|H3|DIV|SPAN)$/.test(n.tagName) && n.children.length <= 3) {
        var t = text(n);
        if (t.length >= 20 && t.length <= 320) return t;
      }
    }
    return "";
  }

  // Real framework markers on rendered elements (not guesses from class names).
  function frameworks() {
    var found = [];
    var els = [document.getElementById("root"), document.getElementById("__next"), document.getElementById("app"), document.body.firstElementChild].filter(Boolean);
    for (var i = 0; i < els.length; i++) {
      var keys = Object.keys(els[i]);
      if (keys.some(function (k) { return k.indexOf("__react") === 0; })) found.push("react");
      if (els[i].__vue_app__ || els[i].__vue__) found.push("vue");
    }
    if (document.querySelector("[ng-version]")) found.push("angular");
    if (document.querySelector("[class*='svelte-']")) found.push("svelte");
    if (document.querySelector("[q\\:container]")) found.push("qwik");
    try {
      if (getComputedStyle(document.documentElement).getPropertyValue("--tw-ring-offset-width") || getComputedStyle(document.body).getPropertyValue("--tw-ring-offset-width")) found.push("tailwind");
    } catch (e) {}
    return found.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }

  var lcp = 0, cls = 0;
  try {
    new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { lcp = Math.max(lcp, e.startTime); }); }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (!e.hadRecentInput) cls += e.value; }); }).observe({ type: "layout-shift", buffered: true });
  } catch (e) {}

  function perf() {
    try {
      var nav = performance.getEntriesByType("navigation")[0] || {};
      var res = performance.getEntriesByType("resource");
      var bytes = { js: 0, css: 0, img: 0, font: 0, other: 0 }, hosts = {};
      var self = location.hostname.replace(/^www\./, "");
      res.forEach(function (r) {
        var size = r.transferSize || r.encodedBodySize || 0;
        var t = r.initiatorType === "script" ? "js" : r.initiatorType === "css" || /\.css(\?|$)/.test(r.name) ? "css" : r.initiatorType === "img" || /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/.test(r.name) ? "img" : /\.(woff2?|ttf|otf)(\?|$)/.test(r.name) ? "font" : "other";
        bytes[t] += size;
        try {
          var h = new URL(r.name).hostname.replace(/^www\./, "");
          if (h && h !== self && h.slice(-self.length - 1) !== "." + self) hosts[h] = 1;
        } catch (e) {}
      });
      return {
        ttfb: Math.round(nav.responseStart || 0),
        dcl: Math.round(nav.domContentLoadedEventEnd || 0),
        load: Math.round(nav.loadEventEnd || 0),
        lcp: Math.round(lcp),
        cls: Math.round(cls * 1000) / 1000,
        requests: res.length + 1,
        kb: { html: Math.round((nav.transferSize || nav.encodedBodySize || 0) / 1024), js: Math.round(bytes.js / 1024), css: Math.round(bytes.css / 1024), img: Math.round(bytes.img / 1024), font: Math.round(bytes.font / 1024), other: Math.round(bytes.other / 1024) },
        third: Object.keys(hosts).slice(0, 60),
        res: res.map(function (r) { return r.name.slice(0, 140); }).slice(0, 120)
      };
    } catch (e) {
      return null;
    }
  }

  function fonts() {
    var out = {};
    try {
      document.fonts.forEach(function (f) { if (f.status === "loaded") out[f.family.replace(/["']/g, "")] = 1; });
    } catch (e) {}
    return Object.keys(out).slice(0, 12);
  }

  function go() {
    try {
      var W = innerWidth, H = innerHeight, h = document.querySelector("h1"), hb = null;
      if (h) {
        var r = document.createRange();
        r.selectNodeContents(h);
        hb = box(r.getBoundingClientRect(), W, H) || box(h.getBoundingClientRect(), W, H);
      }
      var bs = [].slice.call(document.querySelectorAll(BUTTONS)).map(function (e) {
        var t = (e.innerText || e.value || "").trim();
        var b = box(e.getBoundingClientRect(), W, H);
        return b && t && t.length <= 60 ? b.concat([t]) : null;
      }).filter(Boolean).slice(0, 16);
      var g = GLOBALS.filter(function (k) { try { return typeof window[k] !== "undefined" && window[k] !== null; } catch (e) { return false; } });
      document.documentElement.setAttribute("data-smp", JSON.stringify({
        w: W, h: H, head: hb, buttons: bs, sub: subhead(h).slice(0, 320),
        g: g, fw: frameworks(), perf: perf(), fonts: fonts(),
        scripts: [].slice.call(document.scripts).map(function (s) { return s.src; }).filter(Boolean).map(function (s) { return s.slice(0, 160); }).slice(0, 60)
      }));
    } catch (e) {}
  }
  go();
  setTimeout(go, 500);
  setTimeout(go, 1200);
})();
