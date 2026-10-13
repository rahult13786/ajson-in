// Post-build step: turns dist/index.html into one static, crawlable HTML file per landing route
// (dist/json-formatter/index.html, ...) plus sitemap.xml and robots.txt. Each file carries its own
// <title>, meta description, canonical URL, Open Graph tags, JSON-LD (WebApplication + FAQPage)
// and the full landing copy inside #root, so search engines index real content without having to
// run any JavaScript. React replaces that markup as soon as the app boots.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const pages = JSON.parse(readFileSync(join(root, "src/seo/pages.json"), "utf8"));
const site = JSON.parse(readFileSync(join(root, "src/seo/site.json"), "utf8"));
const siteUrl = (process.env.SITE_URL || site.siteUrl).replace(/\/+$/, "");
const template = readFileSync(join(dist, "index.html"), "utf8");
const list = Object.values(pages);

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const url = (slug) => `${siteUrl}/${slug}`;

function body(p) {
  const links = p.related
    .map((r) => `<li><a href="/${r.slug}">${esc(r.anchor)}</a> – ${esc(pages[r.slug].tagline)}</li>`)
    .join("");
  const all = list
    .map((q) => (q.slug === p.slug ? `<strong>${esc(q.navLabel)}</strong>` : `<a href="/${q.slug}">${esc(q.navLabel)}</a>`))
    .join(" · ");
  return `<header><h1>${esc(p.h1)}</h1><p>${esc(p.tagline)}</p></header>
<article>
<section><h2>${esc(p.h1.replace(/ – .*$/, ""))}: what it does</h2>${p.intro.map((t) => `<p>${esc(t)}</p>`).join("")}</section>
<section><h2>${esc(p.featuresTitle)}</h2><ul>${p.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></section>
<section><h2>${esc(p.howTitle)}</h2><ol>${p.how.map((f) => `<li>${esc(f)}</li>`).join("")}</ol></section>
<section><h2>Examples</h2>${p.examples
    .map((e) => `<h3>${esc(e.title)}</h3><p>${esc(e.text)}</p><pre>${esc(e.sample ?? `${e.left}\n${e.right}`)}</pre>`)
    .join("")}</section>
<section><h2>Frequently asked questions</h2>${p.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("")}</section>
<nav aria-label="Related JSON tools"><h2>More JSON tools</h2><ul>${links}</ul><p>All ${esc(site.brand)} tools: ${all}</p></nav>
</article>`;
}

function jsonLd(p) {
  const app = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: p.h1,
    url: url(p.slug),
    description: p.description,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any (web browser)",
    browserRequirements: "Requires JavaScript",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    isPartOf: { "@type": "WebSite", name: site.brand, url: siteUrl },
  };
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: p.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return [app, faq].map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`).join("\n    ");
}

function render(p) {
  const head = `<title>${esc(p.title)}</title>
    <meta name="description" content="${esc(p.description)}" />
    <link rel="canonical" href="${url(p.slug)}" />
    <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${esc(site.brand)}" />
    <meta property="og:title" content="${esc(p.title)}" />
    <meta property="og:description" content="${esc(p.description)}" />
    <meta property="og:url" content="${url(p.slug)}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${esc(p.title)}" />
    <meta name="twitter:description" content="${esc(p.description)}" />
    ${jsonLd(p)}`;
  let html = template.replace(/<title>[\s\S]*?<\/title>/, head);
  html = html.replace('<div id="root"></div>', `<div id="root">${body(p)}</div>`);
  if (!html.includes(`href="${url(p.slug)}"`)) throw new Error(`prerender failed for ${p.slug}`);
  return html;
}

for (const p of list) {
  const dir = join(dist, p.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), render(p));
}
// "/" serves the formatter; its canonical points at the dedicated landing page.
writeFileSync(join(dist, "index.html"), render(pages["json-formatter"]));

const today = new Date().toISOString().slice(0, 10);
writeFileSync(
  join(dist, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${list
    .map((p) => `  <url><loc>${url(p.slug)}</loc><lastmod>${today}</lastmod><priority>${p.slug === "json-formatter" ? "1.0" : "0.8"}</priority></url>`)
    .join("\n")}\n</urlset>\n`
);
writeFileSync(join(dist, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
console.log(`prerendered ${list.length} landing pages + sitemap.xml + robots.txt (${siteUrl})`);
