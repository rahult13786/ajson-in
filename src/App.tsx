import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import "./App.css";
import Sidebar, { type PageId, type Theme } from "./Sidebar";
import InspectorPage from "./InspectorPage";
import ComparePage from "./ComparePage";
import SearchPage from "./SearchPage";
import SwaggerPage from "./SwaggerPage";

const THEME_KEY = "payload-inspector-theme";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export default function App() {
  const [page, setPage] = useState<PageId>("inspect");
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return (
    <div className="app-shell">
      <Sidebar page={page} onNavigate={setPage} theme={theme} onThemeChange={setTheme} />
      <main className="app-main">
        {page === "inspect" && <InspectorPage />}
        {page === "compare" && <ComparePage />}
        {page === "search" && <SearchPage />}
        {page === "swagger" && <SwaggerPage />}
      </main>
      <Analytics />
    </div>
  );
}
