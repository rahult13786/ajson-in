import { useMemo, useRef, useState } from "react";
import { usePersistedText } from "./draftsDb";
import ResizableSplit from "./ResizableSplit";
import { parsePayload } from "./payloadParser";
import { collectKeyMatches, collectValueMatches, type KeyMatch, type ValueMatch } from "./jsonPositions";
import { selectTextareaRange } from "./textNav";
import { formatPathForKind, formatBytes, byteSize } from "./jsonUtils";
import { FavoritesBrowserModal } from "./FavoritesModal";

const SAMPLE = `{
  "id": "evt_3Nk29ALx",
  "type": "payment.succeeded",
  "data": {
    "object": {
      "id": "pay_1Hh1X",
      "amount": 4999,
      "currency": "usd",
      "customer": {
        "id": "cus_9s6XKzkNRiz8i3",
        "email": "jordan@example.com",
        "tags": ["vip", "beta"]
      },
      "metadata": { "order_id": "ord_88213", "warehouse": null }
    }
  },
  "attempts": 1,
  "success": true
}`;

const LONG_PRESS_MS = 550;

/** Stringifies a matched value the same way collectValueMatches previews do, so a sub-filter
 *  can search a KeyMatch's (possibly non-string) value consistently. */
function previewOf(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function highlight(text: string, query: string) {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="search-mark">{text.slice(idx, idx + query.trim().length)}</mark>
      {text.slice(idx + query.trim().length)}
    </>
  );
}

export default function SearchPage() {
  const [raw, setRaw] = usePersistedText("search");
  const [query, setQuery] = useState("");
  const [keyRefine, setKeyRefine] = useState("");
  const [valueRefine, setValueRefine] = useState("");
  const [activePath, setActivePath] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [showBrowseModal, setShowBrowseModal] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);

  const parsed = useMemo(() => (raw.trim() === "" ? null : parsePayload(raw)), [raw]);

  /** XML-aware path formatting: substitutes the real root tag instead of stripping "root". */
  function pathFor(path: string): string {
    return parsed?.ok ? formatPathForKind(path, parsed.kind, parsed.rootLabel) : path;
  }

  const hasQuery = query.trim() !== "";
  const q = query.trim().toLowerCase();

  const baseKeyMatches: KeyMatch[] = useMemo(() => {
    if (!parsed?.ok || !hasQuery) return [];
    return collectKeyMatches(parsed.posRoot).filter((m) => m.key.toLowerCase().includes(q));
  }, [parsed, hasQuery, q]);

  const baseValueMatches: ValueMatch[] = useMemo(() => {
    if (!parsed?.ok || !hasQuery) return [];
    return collectValueMatches(parsed.posRoot).filter((m) => m.preview.toLowerCase().includes(q));
  }, [parsed, hasQuery, q]);

  // "Matches in keys" sub-filter: the main query already narrowed these to rows whose KEY
  // matches; the sub-filter further narrows by the associated VALUE — e.g. searching "id"
  // then refining with "pay" keeps only the "id" key whose value contains "pay".
  const displayedKeyMatches = useMemo(() => {
    const refine = keyRefine.trim().toLowerCase();
    if (!refine) return baseKeyMatches;
    return baseKeyMatches.filter((m) => previewOf(m.value).toLowerCase().includes(refine));
  }, [baseKeyMatches, keyRefine]);

  // "Matches in values" sub-filter: the main query already narrowed these to rows whose VALUE
  // matches; the sub-filter further narrows by the associated KEY — e.g. searching "id" then
  // refining with "pay" keeps only value-matches whose key contains "pay".
  const displayedValueMatches = useMemo(() => {
    const refine = valueRefine.trim().toLowerCase();
    if (!refine) return baseValueMatches;
    return baseValueMatches.filter((m) => m.key.toLowerCase().includes(refine));
  }, [baseValueMatches, valueRefine]);

  function navigateTo(path: string, rowStart: number, rowEnd: number) {
    setActivePath(path);
    if (!textareaRef.current) return;
    selectTextareaRange(textareaRef.current, rowStart, rowEnd);
  }

  async function copyPath(path: string) {
    await navigator.clipboard.writeText(pathFor(path));
    setCopiedPath(path);
    setTimeout(() => setCopiedPath((c) => (c === path ? null : c)), 1200);
  }

  function startPress(path: string) {
    longPressFired.current = false;
    pressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      copyPath(path);
    }, LONG_PRESS_MS);
  }

  function cancelPress() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function handleResultClick(m: { path: string; rowStart: number; rowEnd: number }) {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    navigateTo(m.path, m.rowStart, m.rowEnd);
  }

  function handleLoadSample() {
    setRaw(SAMPLE);
    setActivePath(null);
  }

  function handleClear() {
    setRaw("");
    setQuery("");
    setKeyRefine("");
    setValueRefine("");
    setActivePath(null);
  }

  // "My favorites" here only ever loads into the paste-payload (left) side.
  function handleLoadFavorite(favRaw: string) {
    setRaw(favRaw);
    setActivePath(null);
    setShowBrowseModal(false);
  }

  const stats = useMemo(() => {
    const lines = raw === "" ? 0 : raw.split("\n").length;
    return { lines, bytes: byteSize(raw) };
  }, [raw]);

  const status: "empty" | "valid" | "invalid" = !parsed ? "empty" : parsed.ok ? "valid" : "invalid";

  const leftPanel = (
    <section className="pane pane-left">
      <div className="pane-header">
        <h2>Paste payload</h2>
      </div>
      <textarea
        ref={textareaRef}
        className="input-area"
        spellCheck={false}
        placeholder="Paste JSON or XML to search across its keys and values…"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          setActivePath(null);
        }}
      />
      <div className="pane-footer">
        <span>{stats.lines} lines</span>
        <span>{formatBytes(stats.bytes)}</span>
        {parsed?.ok && <span className="kind-pill">{parsed.kind}</span>}
        {activePath && <span>{pathFor(activePath)}</span>}
      </div>
    </section>
  );

  const resultsPanel = (
    <section className="pane search-results-pane">
      <div className="search-box">
        <input
          className="search-input"
          placeholder="Search keys and values…"
          value={query}
          disabled={status !== "valid"}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="search-results-columns">
        <div className="search-result-col">
          <h3>Matches in keys ({displayedKeyMatches.length})</h3>
          <div className="search-refine-wrapper">
            <input
              className="search-refine-input"
              placeholder="Filter by values…"
              value={keyRefine}
              onChange={(e) => setKeyRefine(e.target.value)}
              disabled={baseKeyMatches.length === 0}
            />
          </div>
          <div className="search-result-list">
            {!hasQuery && <p className="search-empty">Type in the search box to find matching keys.</p>}
            {hasQuery && displayedKeyMatches.length === 0 && <p className="search-empty">No key matches.</p>}
            {displayedKeyMatches.map((m, i) => (
              <button
                key={`${m.path}-${i}`}
                type="button"
                className={`search-result-item ${activePath === m.path ? "active" : ""} ${
                  copiedPath === m.path ? "copied" : ""
                }`}
                onPointerDown={() => startPress(m.path)}
                onPointerUp={cancelPress}
                onPointerLeave={cancelPress}
                onClick={() => handleResultClick(m)}
                title="Click to jump to it · press and hold to copy its path"
              >
                <span className="search-result-path">{pathFor(m.path)}</span>
                <span className="search-result-preview">{highlight(m.key, query)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="search-result-col">
          <h3>Matches in values ({displayedValueMatches.length})</h3>
          <div className="search-refine-wrapper">
            <input
              className="search-refine-input"
              placeholder="Filter by key…"
              value={valueRefine}
              onChange={(e) => setValueRefine(e.target.value)}
              disabled={baseValueMatches.length === 0}
            />
          </div>
          <div className="search-result-list">
            {!hasQuery && <p className="search-empty">Type in the search box to find matching values.</p>}
            {hasQuery && displayedValueMatches.length === 0 && <p className="search-empty">No value matches.</p>}
            {displayedValueMatches.map((m, i) => (
              <button
                key={`${m.path}-${i}`}
                type="button"
                className={`search-result-item ${activePath === m.path ? "active" : ""} ${
                  copiedPath === m.path ? "copied" : ""
                }`}
                onPointerDown={() => startPress(m.path)}
                onPointerUp={cancelPress}
                onPointerLeave={cancelPress}
                onClick={() => handleResultClick(m)}
                title="Click to jump to it · press and hold to copy its path"
              >
                <span className="search-result-path">{pathFor(m.path)}</span>
                <span className="search-result-preview">{highlight(m.preview, query)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <>
      <div className="page-statusbar">
        <div className={`status-pill status-${status}`}>
          <span className="status-dot" />
          {status === "empty" && "Waiting for input"}
          {status === "valid" && `Valid ${parsed?.ok ? parsed.kind.toUpperCase() : ""}`}
          {status === "invalid" && "Invalid payload"}
        </div>
        <div className="toolbar">
          <button className="btn" onClick={handleLoadSample}>
            Load sample
          </button>
          <button className="btn" onClick={() => setShowBrowseModal(true)}>
            My favorites
          </button>
          <button className="btn btn-ghost" onClick={handleClear} disabled={!raw}>
            Clear
          </button>
        </div>
        {status === "invalid" && parsed && !parsed.ok && (
          <span className="hint-text">
            {parsed.message} — line {parsed.line}, column {parsed.col}
          </span>
        )}
      </div>
      <ResizableSplit storageKey="search-row" direction="row" min={25} max={75} left={leftPanel} right={resultsPanel} />

      {showBrowseModal && (
        <FavoritesBrowserModal onClose={() => setShowBrowseModal(false)} onLoad={handleLoadFavorite} />
      )}
    </>
  );
}
