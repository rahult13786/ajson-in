import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import JsonTree from "./JsonTree";
import XmlTree from "./XmlTree";
import GraphView from "./GraphView";
import ResizableSplit from "./ResizableSplit";
import { byteSize, formatBytes, collectContainerPaths, formatPathForKind, type JsonValue } from "./jsonUtils";
import { parsePayload } from "./payloadParser";
import { findNodeAtOffset, findNodeAtPath } from "./jsonPositions";
import { selectTextareaRange } from "./textNav";
import { SaveFavoriteModal, FavoritesBrowserModal } from "./FavoritesModal";
import { CopyIcon, DownloadIcon, CheckIcon, MaximizeIcon, MinimizeIcon, StarIcon } from "./icons";

// "text" has no toolbar button of its own (Tree/Graph are the only selectable views) — it's
// entered automatically by Format/Minify so their result is actually visible somewhere, since
// neither ever touches the input and Tree/Graph render structure, not raw formatted text.
type ViewMode = "tree" | "graph" | "text";

const JSON_SAMPLE = `{
  "id": "evt_3Nk29ALx",
  "type": "payment.succeeded",
  "created": 1715020800,
  "livemode": false,
  "data": {
    "object": {
      "id": "pay_1Hh1X",
      "amount": 4999,
      "currency": "usd",
      "status": "succeeded",
      "customer": {
        "id": "cus_9s6XKzkNRiz8i3",
        "email": "jordan@example.com",
        "tags": ["vip", "beta"]
      },
      "metadata": {
        "order_id": "ord_88213",
        "warehouse": null
      }
    }
  },
  "attempts": 1,
  "success": true
}`;

const XML_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<order id="ord_88213" status="succeeded">
  <customer id="cus_9s6XKzkNRiz8i3">
    <email>jordan@example.com</email>
    <tags>
      <tag>vip</tag>
      <tag>beta</tag>
    </tags>
  </customer>
  <amount currency="usd">4999</amount>
  <attempts>1</attempts>
</order>`;

function deriveFavoriteName(raw: string, kind: string): string {
  const firstLine = raw.trim().split("\n")[0]?.trim() ?? "";
  if (firstLine.length > 0 && firstLine.length <= 48) return firstLine;
  return `${kind.toUpperCase()} payload — ${new Date().toLocaleTimeString()}`;
}

export default function InspectorPage() {
  const [raw, setRaw] = useState("");
  const [outputText, setOutputText] = useState("");
  const [copied, setCopied] = useState(false);
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  const [showFullPath, setShowFullPath] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("tree");
  const [activePath, setActivePath] = useState<string | null>(null);
  const [rightFullscreen, setRightFullscreen] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showBrowseModal, setShowBrowseModal] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const parsed = useMemo(() => {
    if (raw.trim() === "") return null;
    return parsePayload(raw);
  }, [raw]);

  useEffect(() => {
    if (parsed?.ok) setOutputText(parsed.formatted);
  }, [raw]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const lines = raw === "" ? 0 : raw.split("\n").length;
    const bytes = byteSize(raw);
    return { lines, bytes };
  }, [raw]);

  function handleToggleNode(path: string) {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function handleCollapseAll() {
    if (parsed?.ok) setCollapsedPaths(new Set(collectContainerPaths(parsed.value)));
  }

  function handleExpandAll() {
    setCollapsedPaths(new Set());
  }

  /**
   * Format only ever rewrites the result/output side, for both JSON and XML — it never touches
   * the input textarea. It also switches to the (button-less) "text" view so the result is
   * actually visible: Tree/Graph render parsed *structure*, not raw text, so without this the
   * click would have no visible effect at all.
   */
  function handleFormat() {
    if (!parsed?.ok) return;
    setOutputText(parsed.formatted);
    setViewMode("text");
  }

  /** Minify only ever rewrites the result/output side — for both JSON and XML — never the input. */
  function handleMinify() {
    if (!parsed?.ok) return;
    setOutputText(parsed.minified);
    setViewMode("text");
  }

  function handleClear() {
    setRaw("");
    setOutputText("");
    setCollapsedPaths(new Set());
    setActivePath(null);
    setViewMode("tree");
  }

  function handleLoadJsonSample() {
    setRaw(JSON_SAMPLE);
    setCollapsedPaths(new Set());
    setActivePath(null);
    setViewMode("tree");
  }

  function handleLoadXmlSample() {
    setRaw(XML_SAMPLE);
    setCollapsedPaths(new Set());
    setActivePath(null);
    setViewMode("tree");
  }

  async function handleCopy() {
    if (!outputText) return;
    await navigator.clipboard.writeText(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleDownload() {
    if (!outputText) return;
    const ext = parsed?.ok && parsed.kind === "xml" ? "xml" : "json";
    const mime = ext === "xml" ? "application/xml" : "application/json";
    const blob = new Blob([outputText], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payload.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFavoriteSaved() {
    setShowSaveModal(false);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 1500);
  }

  function handleLoadFavorite(favRaw: string) {
    setRaw(favRaw);
    setCollapsedPaths(new Set());
    setActivePath(null);
    setViewMode("tree");
    setShowBrowseModal(false);
  }

  function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setRaw(String(reader.result ?? ""));
      setCollapsedPaths(new Set());
      setActivePath(null);
      setViewMode("tree");
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleTextareaCursor() {
    if (!parsed?.ok || !textareaRef.current) return;
    const offset = textareaRef.current.selectionStart;
    const node = findNodeAtOffset(parsed.posRoot, offset);
    if (node) setActivePath(node.path);
  }

  function handleSelectPathFromTree(path: string) {
    setActivePath(path);
    if (!parsed?.ok || !textareaRef.current) return;
    const node = findNodeAtPath(parsed.posRoot, path);
    if (!node) return;
    const start = node.keyStart ?? node.valueStart;
    selectTextareaRange(textareaRef.current, start, node.valueEnd);
  }

  const status: "empty" | "valid" | "invalid" = !parsed ? "empty" : parsed.ok ? "valid" : "invalid";
  const kindLabel = parsed?.ok ? parsed.kind : null;

  const breadcrumb =
    activePath && parsed?.ok ? formatPathForKind(activePath, parsed.kind, parsed.rootLabel) : null;

  const rightToolbar = (
    <div className="pane-header">
      <h2>Formatted output</h2>
      <div className="toolbar">
        <button onClick={handleFormat} className="btn" disabled={status !== "valid"}>
          Format
        </button>
        <button onClick={handleMinify} className="btn" disabled={status !== "valid"}>
          Minify
        </button>
        <span className="toolbar-divider" />
        <div className="view-mode-group">
          <button
            onClick={() => setViewMode("tree")}
            className={`btn ${viewMode === "tree" ? "btn-active" : ""}`}
            disabled={status !== "valid"}
          >
            Tree
          </button>
          <button
            onClick={() => setViewMode("graph")}
            className={`btn ${viewMode === "graph" ? "btn-active" : ""}`}
            disabled={status !== "valid"}
          >
            Graph view
          </button>
        </div>
        {viewMode === "tree" && (
          <>
            <button onClick={handleCollapseAll} className="btn" disabled={status !== "valid"}>
              Collapse all
            </button>
            <button onClick={handleExpandAll} className="btn" disabled={status !== "valid"}>
              Expand all
            </button>
            <button
              onClick={() => setShowFullPath((v) => !v)}
              className={`btn ${showFullPath ? "btn-active" : ""}`}
              disabled={status !== "valid"}
            >
              Show full path
            </button>
          </>
        )}
        <span className="toolbar-divider" />
        <button onClick={handleCopy} className="btn icon-btn" disabled={!outputText} title="Copy result">
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
        <button onClick={handleDownload} className="btn btn-accent icon-btn" disabled={!outputText} title="Download result">
          <DownloadIcon />
        </button>
        <button
          onClick={() => setRightFullscreen((v) => !v)}
          className="btn icon-btn icon-btn-only"
          title={rightFullscreen ? "Exit full screen" : "Full Screen"}
        >
          {rightFullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
        </button>
      </div>
    </div>
  );

  const rightBody = (
    <>
      <div className="path-bar">
        <span className="path-bar-label">{parsed?.ok && parsed.kind === "xml" ? "XML path" : "JSON path"}</span>
        {breadcrumb ? (
          breadcrumb.split(/(?=[.[])/).map((seg, i) => (
            <span key={i} className="path-bar-segment">
              {seg}
            </span>
          ))
        ) : (
          <span className="hint-text">Click a field on either side to see its path here</span>
        )}
      </div>

      <div className={`output-area ${viewMode === "graph" ? "output-area-graph" : ""}`}>
        {status === "empty" && (
          <div className="empty-state">
            <span className="empty-glyph">{"{ }"}</span>
            <p>Formatted, validated output will render here.</p>
          </div>
        )}

        {status === "invalid" && parsed && !parsed.ok && (
          <div className="error-state">
            <div className="error-banner">
              <span className="error-label">{parsed.kind === "xml" ? "XML error" : "SyntaxError"}</span>
              <span>
                {parsed.message} — line {parsed.line}, column {parsed.col}
              </span>
            </div>
            <div className="code-block">
              <div className="gutter">
                {raw.split("\n").map((_, i) => (
                  <div key={i} className={i + 1 === parsed.line ? "gutter-line err" : "gutter-line"}>
                    {i + 1}
                  </div>
                ))}
              </div>
              <div className="code">
                {raw.split("\n").map((line, i) => (
                  <div key={i} className={i + 1 === parsed.line ? "code-line err" : "code-line"}>
                    {line || " "}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {status === "valid" && parsed && parsed.ok && viewMode === "tree" && parsed.kind === "json" && (
          <JsonTree
            data={parsed.value as JsonValue}
            collapsedPaths={collapsedPaths}
            onToggle={handleToggleNode}
            showFullPath={showFullPath}
            activePath={activePath}
            onSelectPath={handleSelectPathFromTree}
          />
        )}

        {status === "valid" && parsed && parsed.ok && viewMode === "tree" && parsed.kind === "xml" && (
          <XmlTree
            root={parsed.posRoot}
            rootTag={parsed.rootLabel}
            collapsedPaths={collapsedPaths}
            onToggle={handleToggleNode}
            showFullPath={showFullPath}
            activePath={activePath}
            onSelectPath={handleSelectPathFromTree}
          />
        )}

        {status === "valid" && parsed && parsed.ok && viewMode === "graph" && (
          <GraphView data={parsed.value as JsonValue} rootLabel={parsed.rootLabel} onSelectPath={handleSelectPathFromTree} />
        )}

        {status === "valid" && parsed && parsed.ok && viewMode === "text" && (
          <div className="output-text-wrap">
            <div className="output-text-banner">
              Showing the result of {outputText === parsed.minified ? "Minify" : "Format"} — Copy/Download reflect
              this.
              <button className="btn btn-ghost" onClick={() => setViewMode("tree")}>
                Back to Tree
              </button>
            </div>
            <pre className="output-text-block">{outputText}</pre>
          </div>
        )}
      </div>
    </>
  );

  const rightPanel = (
    <section className="pane pane-right">
      {rightToolbar}
      {rightBody}
    </section>
  );

  const leftPanel = (
    <section className="pane pane-left">
      <div className="pane-header">
        <h2>Paste payload</h2>
        <div className="toolbar">
          <button onClick={handleLoadJsonSample} className="btn">
            JSON sample
          </button>
          <button onClick={handleLoadXmlSample} className="btn">
            XML sample
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="btn">
            Upload file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.xml,.txt,application/json,application/xml,text/xml,text/plain"
            onChange={handleFileUpload}
            hidden
          />
          <button
            onClick={() => setShowSaveModal(true)}
            className="btn icon-btn"
            disabled={raw === ""}
            title="Save to favorites"
          >
            <StarIcon />
            {savedToast ? <span className="favorite-save-feedback">Saved</span> : null}
          </button>
          <button onClick={() => setShowBrowseModal(true)} className="btn">
            My favorites
          </button>
          <button onClick={handleClear} className="btn btn-ghost" disabled={raw === ""}>
            Clear
          </button>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        className="input-area"
        spellCheck={false}
        placeholder={`Paste JSON or XML — a webhook body, an API response, a config file, anything.\n\nIt'll be validated and formatted on the right as you type.`}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onClick={handleTextareaCursor}
        onKeyUp={handleTextareaCursor}
      />
      <div className="pane-footer">
        <span>{stats.lines} lines</span>
        <span>{formatBytes(stats.bytes)}</span>
        {kindLabel && <span className="kind-pill">{kindLabel}</span>}
      </div>
    </section>
  );

  return (
    <>
      <div className="page-statusbar">
        <div className={`status-pill status-${status}`}>
          <span className="status-dot" />
          {status === "empty" && "Waiting for input"}
          {status === "valid" && `Valid ${kindLabel?.toUpperCase()} · ${formatBytes(stats.bytes)} · ${stats.lines} lines`}
          {status === "invalid" && "Invalid payload"}
        </div>
      </div>

      {rightFullscreen ? (
        <>
          <div className="panes-static" style={{ display: "none" }}>
            {leftPanel}
          </div>
          <div className="fullscreen-overlay">{rightPanel}</div>
        </>
      ) : (
        <ResizableSplit storageKey="inspector" left={leftPanel} right={rightPanel} />
      )}

      {showSaveModal && parsed?.ok && (
        <SaveFavoriteModal
          raw={raw}
          kind={parsed.kind}
          defaultName={deriveFavoriteName(raw, parsed.kind)}
          onClose={() => setShowSaveModal(false)}
          onSaved={handleFavoriteSaved}
        />
      )}

      {showBrowseModal && (
        <FavoritesBrowserModal onClose={() => setShowBrowseModal(false)} onLoad={handleLoadFavorite} />
      )}
    </>
  );
}
