import { SunIcon, MoonIcon } from "./icons";

import type { PageId } from "./seo/routes";
export type { PageId };
export type Theme = "dark" | "light";

// The Swagger page ("swagger") is intentionally left out of this nav list — it's hidden from
// the UI while more work is pending on it, but it stays a fully valid PageId and App.tsx still
// routes to it, so the page itself is untouched and reachable again the moment it's added back
// here.
const NAV_ITEMS: { id: PageId; slug: string; label: string; glyph: string }[] = [
  { id: "inspect", slug: "json-formatter", label: "Formatter", glyph: "{}" },
  { id: "compare", slug: "json-compare", label: "Compare", glyph: "⇄" },
  { id: "search", slug: "json-search", label: "Search", glyph: "⌕" },
];

export default function Sidebar({
  page,
  onNavigate,
  theme,
  onThemeChange,
}: {
  page: PageId;
  onNavigate: (slug: string) => void;
  theme: Theme;
  onThemeChange: (t: Theme) => void;
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark">{"{ }"}</span>
        <span className="brand-name">AJSON</span>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.id}
            href={`/${item.slug}`}
            className={`sidebar-nav-btn ${page === item.id ? "active" : ""}`}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              onNavigate(item.slug);
            }}
          >
            <span className="sidebar-nav-glyph" aria-hidden="true">
              {item.glyph}
            </span>
            <span className="sidebar-nav-label">{item.label}</span>
          </a>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="theme-toggle" role="group" aria-label="Theme">
          <button
            className={`theme-btn ${theme === "dark" ? "active" : ""}`}
            onClick={() => onThemeChange("dark")}
            aria-pressed={theme === "dark"}
            title="Dark theme"
          >
            <MoonIcon />
          </button>
          <button
            className={`theme-btn ${theme === "light" ? "active" : ""}`}
            onClick={() => onThemeChange("light")}
            aria-pressed={theme === "light"}
            title="Light theme"
          >
            <SunIcon />
          </button>
        </div>
      </div>
    </aside>
  );
}
