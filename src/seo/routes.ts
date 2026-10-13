import pagesJson from "./pages.json";
import site from "./site.json";

export type PageId = "inspect" | "compare" | "search" | "swagger";
export type InitialView = "graph" | null;

export interface Example {
  title: string;
  text: string;
  sample?: string;
  left?: string;
  right?: string;
  action?: "tree" | "minify" | "repair" | "graph";
  query?: string;
}

export interface SeoPage {
  slug: string;
  page: PageId;
  view: InitialView;
  navLabel: string;
  title: string;
  description: string;
  h1: string;
  tagline: string;
  intro: string[];
  featuresTitle: string;
  features: string[];
  howTitle: string;
  how: string[];
  examples: Example[];
  faq: { q: string; a: string }[];
  related: { slug: string; anchor: string }[];
}

export const SITE_URL: string = site.siteUrl;
export const BRAND: string = site.brand;

export const SEO_PAGES = pagesJson as unknown as Record<string, SeoPage>;
export const SEO_PAGE_LIST: SeoPage[] = Object.values(SEO_PAGES);

/** "/" is the formatter; its canonical URL is the dedicated /json-formatter landing page. */
export const DEFAULT_SLUG = "json-formatter";

export function pathFor(slug: string): string {
  return `/${slug}`;
}

export function urlFor(slug: string): string {
  return `${SITE_URL}${pathFor(slug)}`;
}

/** Maps a location pathname to a route; unknown paths fall back to the formatter. */
export function routeForPath(pathname: string): SeoPage {
  const clean = pathname.replace(/\/+$/, "").replace(/^\//, "").replace(/\/index\.html$/, "");
  return SEO_PAGES[clean] ?? SEO_PAGES[DEFAULT_SLUG];
}
