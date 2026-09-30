import { SunIcon, MoonIcon } from "./icons";

export type PageId = "inspect" | "compare" | "search" | "swagger";
export type Theme = "dark" | "light";

// The Swagger page ("swagger") is intentionally left out of this nav list — it's hidden from
// the UI while more work is pending on it, but it stays a fully valid PageId and App.tsx still
// routes to it, so the page itself is untouched and reachable again the moment it's added back
// here.
const NAV_ITEMS: { id: PageId; label: string; glyph: string }[] = [
  { id: "inspect", label: "Formatter", glyph: "{}" },
  { id: "compare", label: "Compare", glyph: "⇄" },
  { id: "search", label: "Search", glyph: "⌕" },
];

export default function Sidebar({
  page,
  onNavigate,
  theme,
  onThemeChange,
}: {
  page: PageId;
  onNavigate: (p: PageId) => void;
  theme: Theme;
  onThemeChange: (t: Theme) => void;
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark">{"{ }"}</span>
        <span className="brand-name">Payload Inspector</span>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`sidebar-nav-btn ${page === item.id ? "active" : ""}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="sidebar-nav-glyph" aria-hidden="true">
              {item.glyph}
            </span>
            <span className="sidebar-nav-label">{item.label}</span>
          </button>
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
