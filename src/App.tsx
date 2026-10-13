import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import "./App.css";
import Sidebar, { type Theme } from "./Sidebar";
import { SeoContent, SeoHero, useSeoHead } from "./SeoSection";
import { SEO_PAGES, pathFor, routeForPath } from "./seo/routes";
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
  const [route, setRoute] = useState(() => routeForPath(window.location.pathname));
  const page = route.page;
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useSeoHead(route);

  // Plain History API routing: every tool has its own crawlable URL, with no router dependency.
  useEffect(() => {
    const onPop = () => setRoute(routeForPath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function navigate(slug: string) {
    const next = SEO_PAGES[slug];
    if (!next) return;
    if (window.location.pathname.replace(/\/+$/, "") !== pathFor(slug)) {
      window.history.pushState({}, "", pathFor(slug));
    }
    setRoute(next);
    document.querySelector(".app-main")?.scrollTo({ top: 0 });
  }

  return (
    <div className="app-shell">
      <Sidebar page={page} onNavigate={navigate} theme={theme} onThemeChange={setTheme} />
      <main className="app-main">
        <div className="tool-stage">
          <SeoHero route={route} />
          <div className="tool-body">
            {page === "inspect" && <InspectorPage initialView={route.view} />}
            {page === "compare" && <ComparePage />}
            {page === "search" && <SearchPage />}
            {page === "swagger" && <SwaggerPage />}
          </div>
        </div>
        <SeoContent route={route} onNavigate={navigate} />
      </main>
      <Analytics />
    </div>
  );
}
