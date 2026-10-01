import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const page = (p) => resolve(import.meta.dirname, p);

// The public address, for canonical and share tags. SITE_URL wins; on Vercel the production domain is the fallback.
const SITE = (
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  "http://localhost:5173"
).replace(/\/$/, "");
const isPreview = process.env.VERCEL_ENV === "preview";
const contact = (process.env.CONTACT_EMAIL || "").trim();
const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function siteInfo() {
  let outDir;
  return {
    name: "site-info",
    enforce: "pre",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    transformIndexHtml(html) {
      const contactHtml = contact
        ? `<a href="mailto:${escape(contact)}">${escape(contact)}</a>`
        : "a reply to the email that brought your stamp";
      return html.replaceAll("%SITE_URL%", SITE).replaceAll("%CONTACT%", contactHtml);
    },
    closeBundle() {
      // Preview deployments stay out of search results.
      const robots = isPreview
        ? "User-agent: *\nDisallow: /\n"
        : `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /paid\nDisallow: /v/\n\nSitemap: ${SITE}/sitemap.xml\n`;
      const urls = ["/", "/privacy", "/terms"].map((p) => `  <url><loc>${SITE}${p === "/" ? "/" : p}</loc></url>`).join("\n");
      writeFileSync(resolve(outDir, "robots.txt"), robots);
      writeFileSync(resolve(outDir, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
    },
  };
}

export default defineConfig({
  plugins: [siteInfo(), react()],
  build: {
    rollupOptions: {
      input: {
        home: page("index.html"),
        privacy: page("privacy/index.html"),
        terms: page("terms/index.html"),
        paid: page("paid/index.html"),
        sheet: page("paid/sheet/index.html"),
        resurrection: page("paid/resurrection/index.html"),
        alive: page("paid/alive/index.html"),
        verdict: page("v/index.html"),
        admin: page("admin/index.html"),
      },
    },
  },
});
