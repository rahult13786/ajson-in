import { useEffect } from "react";
import { BRAND, SEO_PAGES, SEO_PAGE_LIST, pathFor, urlFor, type SeoPage } from "./seo/routes";
import { requestExample, type ExampleTarget } from "./exampleBus";

/** Keeps <title>, description, canonical and social tags in step with the current route. */
export function useSeoHead(route: SeoPage) {
  useEffect(() => {
    document.title = route.title;
    const set = (selector: string, attr: string, value: string, create: () => HTMLElement) => {
      let el = document.head.querySelector<HTMLElement>(selector);
      if (!el) {
        el = create();
        document.head.appendChild(el);
      }
      el.setAttribute(attr, value);
    };
    const meta = (key: "name" | "property", name: string, value: string) =>
      set(`meta[${key}="${name}"]`, "content", value, () => {
        const m = document.createElement("meta");
        m.setAttribute(key, name);
        return m;
      });
    meta("name", "description", route.description);
    meta("property", "og:title", route.title);
    meta("property", "og:description", route.description);
    meta("property", "og:url", urlFor(route.slug));
    meta("name", "twitter:title", route.title);
    meta("name", "twitter:description", route.description);
    set('link[rel="canonical"]', "href", urlFor(route.slug), () => {
      const l = document.createElement("link");
      l.setAttribute("rel", "canonical");
      return l;
    });
  }, [route]);
}

/** Compact page header: the H1 and a one-line tagline sit above the tool. */
export function SeoHero({ route }: { route: SeoPage }) {
  return (
    <header className="seo-hero">
      <h1 className="seo-h1">{route.h1}</h1>
      <p className="seo-tagline">{route.tagline}</p>
    </header>
  );
}

const TARGET_BY_PAGE: Record<string, ExampleTarget> = { inspect: "inspect", compare: "compare", search: "search" };

/** Intro copy, features, examples, FAQ and cross-links shown below the tool. */
export function SeoContent({ route, onNavigate }: { route: SeoPage; onNavigate: (slug: string) => void }) {
  const target = TARGET_BY_PAGE[route.page] ?? "inspect";

  function tryExample(ex: SeoPage["examples"][number]) {
    window.scrollTo?.({ top: 0 });
    document.querySelector(".app-main")?.scrollTo({ top: 0, behavior: "smooth" });
    requestExample({ target, sample: ex.sample, left: ex.left, right: ex.right, action: ex.action, query: ex.query });
  }

  const link = (slug: string, text: string) => (
    <a
      href={pathFor(slug)}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onNavigate(slug);
      }}
    >
      {text}
    </a>
  );

  return (
    <article className="seo-content">
      <section>
        <h2>{route.h1.replace(/ – .*$/, "")}: what it does</h2>
        {route.intro.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </section>

      <section>
        <h2>{route.featuresTitle}</h2>
        <ul className="seo-list">
          {route.features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{route.howTitle}</h2>
        <ol className="seo-list">
          {route.how.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>

      <section>
        <h2>Examples</h2>
        <div className="seo-examples">
          {route.examples.map((ex) => (
            <div className="seo-example" key={ex.title}>
              <h3>{ex.title}</h3>
              <p>{ex.text}</p>
              <pre className="seo-code">{ex.sample ?? `${ex.left}\n${ex.right}`}</pre>
              <button className="btn" onClick={() => tryExample(ex)}>
                Try this example
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Frequently asked questions</h2>
        {route.faq.map((f) => (
          <details className="seo-faq" key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </section>

      <nav aria-label="Related JSON tools">
        <h2>More JSON tools</h2>
        <ul className="seo-list seo-links">
          {route.related.map((r) => (
            <li key={r.slug}>
              {link(r.slug, r.anchor)} – {SEO_PAGES[r.slug].tagline}
            </li>
          ))}
        </ul>
        <p className="seo-allTools">
          All {BRAND} tools:{" "}
          {SEO_PAGE_LIST.map((p, i) => (
            <span key={p.slug}>
              {i > 0 && " · "}
              {p.slug === route.slug ? <strong>{p.navLabel}</strong> : link(p.slug, p.navLabel)}
            </span>
          ))}
        </p>
      </nav>
    </article>
  );
}
