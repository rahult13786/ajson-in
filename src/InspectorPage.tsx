import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { usePersistedText } from "./draftsDb";
import JsonTree from "./JsonTree";
import XmlTree from "./XmlTree";
import GraphView from "./GraphView";
import ResizableSplit from "./ResizableSplit";
import {
  byteSize,
  formatBytes,
  collectContainerPaths,
  formatPathForKind,
  tryUnwrapJsonString,
  type JsonValue,
} from "./jsonUtils";
import { parsePayload } from "./payloadParser";
import { repairJson, type RepairOutcome } from "./repairUtils";
import { findNodeAtOffset, findNodeAtPath } from "./jsonPositions";
import { selectTextareaRange } from "./textNav";
import { SaveFavoriteModal, FavoritesBrowserModal } from "./FavoritesModal";
import { CopyIcon, DownloadIcon, CheckIcon, MaximizeIcon, MinimizeIcon, StarIcon } from "./icons";

// "text" has no toolbar button of its own (Tree/Graph are the only selectable views) — it's
// entered automatically by Format/Minify so their result is actually visible somewhere, since
// neither ever touches the input and Tree/Graph render structure, not raw formatted text.
type ViewMode = "tree" | "graph" | "text" | "repair";

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

function RepairView({
  outcome,
  onApply,
  onBack,
}: {
  outcome: RepairOutcome;
  onApply: () => void;
  onBack: () => void;
}) {
  if (!outcome.ok) {
    return (
      <div className="repair-view">
        <div className="error-banner">
          <span className="error-label">Cannot repair</span>
          <span>
            {outcome.message}
            {outcome.line !== null ? ` — line ${outcome.line}, column ${outcome.col}` : ""}
          </span>
        </div>
        <div className="repair-actions">
          <button className="btn btn-ghost" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="repair-view">
      <div className="repair-summary">
        <span>
          {outcome.changed
            ? `Repaired — ${outcome.insertions} insertion${outcome.insertions === 1 ? "" : "s"}, ${outcome.deletions} deletion${
                outcome.deletions === 1 ? "" : "s"
              }`
            : "Nothing to repair — the input is already valid JSON."}
        </span>
        <span className="repair-actions">
          {outcome.changed && (
            <button className="btn btn-accent" onClick={onApply} title="Replace the input with the repaired text">
              Apply to input
            </button>
          )}
          <button className="btn btn-ghost" onClick={onBack}>
            Back to Tree
          </button>
        </span>
      </div>
      <h3 className="repair-heading">
        Changes <span className="hint-text">(raw input vs. repaired, before formatting)</span>
      </h3>
      <pre className="repair-diff">
        {outcome.segments.map((seg, i) =>
          seg.kind === "same" ? (
            <span key={i}>{seg.text}</span>
          ) : (
            <span key={i} className={seg.kind === "add" ? "diff-ins" : "diff-del"}>
              {seg.text}
            </span>
          )
        )}
      </pre>
      <h3 className="repair-heading">Formatted result</h3>
      <pre className="output-text-block repair-formatted">{outcome.formatted}</pre>
    </div>
  );
}

export default function InspectorPage() {
  const [raw, setRaw] = usePersistedText("inspector");
  const [outputText, setOutputText] = useState("");
  const [copied, setCopied] = useState(false);
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  const [showFullPath, setShowFullPath] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("tree");
  const [outputLabel, setOutputLabel] = useState("Format");
  const [repairResult, setRepairResult] = useState<RepairOutcome | null>(null);
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

  // When the input is a "double-encoded" JSON string — a JSON string literal whose own content
  // is itself valid JSON, e.g. pasting `"{\"id\":1}"` instead of `{"id":1}` — every downstream
  // feature (Format, Minify, Tree, Graph view, the path bar) should transparently operate on the
  // *inner* payload instead of the literal one-line string, since that's what anyone pasting
  // stringified JSON actually wants to work with. `effectiveParsed` is that inner payload,
  // re-parsed so it gets its own real formatted/minified text and tree; when the input isn't
  // double-encoded, it's simply `parsed` unchanged — "no special logic" for ordinary JSON/XML.
  const isStringifiedInput = useMemo(
    () => !!(parsed?.ok && parsed.kind === "json" && typeof parsed.value === "string" && tryUnwrapJsonString(parsed.value)),
    [parsed]
  );

  const effectiveParsed = useMemo(() => {
    if (!parsed?.ok || parsed.kind !== "json" || typeof parsed.value !== "string") return parsed;
    const unwrapped = tryUnwrapJsonString(parsed.value);
    if (!unwrapped) return parsed;
    const inner = parsePayload(unwrapped);
    return inner.ok ? inner : parsed;
  }, [parsed]);

  // Keep the output side in sync with whatever effectiveParsed currently is, defaulting to its
  // formatted form (view mode is left alone — Tree already shows the right thing on its own).
  useEffect(() => {
    if (!effectiveParsed?.ok) return;
    setOutputText(effectiveParsed.formatted);
    setOutputLabel(isStringifiedInput ? "Format (auto-detected stringified JSON)" : "Format");
  }, [raw]); // eslint-disable-line react-hooks/exhaustive-deps

  // A repair report describes one specific input, so it's dropped as soon as the input changes
  // (including after "Apply repair", which replaces the input with the repaired text).
  useEffect(() => {
    setRepairResult(null);
    setViewMode((m) => (m === "repair" ? "tree" : m));
  }, [raw]);

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
    if (effectiveParsed?.ok) setCollapsedPaths(new Set(collectContainerPaths(effectiveParsed.value)));
  }

  function handleExpandAll() {
    setCollapsedPaths(new Set());
  }

  /**
   * Format only ever rewrites the result/output side, for both JSON and XML — it never touches
   * the input textarea. It also switches to the (button-less) "text" view so the result is
   * actually visible: Tree/Graph render parsed *structure*, not raw text, so without this the
   * click would have no visible effect at all. Uses `effectiveParsed`, so if the input is
   * stringified JSON this formats the *inner* payload, not the literal one-line string.
   */
  function handleFormat() {
    if (!effectiveParsed?.ok) return;
    setOutputText(effectiveParsed.formatted);
    setOutputLabel(isStringifiedInput ? "Format (auto-detected stringified JSON)" : "Format");
    setViewMode("text");
  }

  /** Minify only ever rewrites the result/output side — for both JSON and XML — never the input. */
  function handleMinify() {
    if (!effectiveParsed?.ok) return;
    setOutputText(effectiveParsed.minified);
    setOutputLabel(isStringifiedInput ? "Minify (auto-detected stringified JSON)" : "Minify");
    setViewMode("text");
  }

  /** Wraps the minified payload as a single escaped JSON string literal — e.g. {"a":1} ->
   *  "{\"a\":1}". Never touches the input. Disabled when the input is already stringified JSON,
   *  since stringifying it again would just add another layer of escaping. */
  function handleStringify() {
    if (!effectiveParsed?.ok || isStringifiedInput) return;
    setOutputText(JSON.stringify(effectiveParsed.minified));
    setOutputLabel("Stringify");
    setViewMode("text");
  }

  /** Repairs the raw input with jsonrepair and shows an inline diff (raw -> repaired) plus the
   *  separately formatted result. Never touches the input unless "Apply repair" is clicked. */
  function handleRepair() {
    if (raw.trim() === "") return;
    const outcome = repairJson(raw);
    setRepairResult(outcome);
    if (outcome.ok) {
      setOutputText(outcome.formatted);
      setOutputLabel("Repair");
    }
    setViewMode("repair");
  }

  function handleApplyRepair() {
    if (repairResult?.ok) setRaw(repairResult.repaired);
  }

  function handleClear() {
    setRaw("");
    setRepairResult(null);
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
    const ext = effectiveParsed?.ok && effectiveParsed.kind === "xml" ? "xml" : "json";
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

  // When the input is double-encoded JSON, the tree/graph on the right reflects the *inner*
  // payload's own offsets, which don't correspond to any position in the raw outer string
  // literal sitting in the textarea — so cursor/selection sync with the input is skipped in
  // that case rather than mapping to the wrong characters.
  function handleTextareaCursor() {
    if (!parsed?.ok || !textareaRef.current || isStringifiedInput) return;
    const offset = textareaRef.current.selectionStart;
    const node = findNodeAtOffset(parsed.posRoot, offset);
    if (node) setActivePath(node.path);
  }

  function handleSelectPathFromTree(path: string) {
    setActivePath(path);
    if (!parsed?.ok || !textareaRef.current || isStringifiedInput) return;
    const node = findNodeAtPath(parsed.posRoot, path);
    if (!node) return;
    const start = node.keyStart ?? node.valueStart;
    selectTextareaRange(textareaRef.current, start, node.valueEnd);
  }

  const status: "empty" | "valid" | "invalid" = !parsed ? "empty" : parsed.ok ? "valid" : "invalid";
  const kindLabel = parsed?.ok ? parsed.kind : null;

  const breadcrumb =
    activePath && effectiveParsed?.ok ? formatPathForKind(activePath, effectiveParsed.kind, effectiveParsed.rootLabel) : null;

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
        <button
          onClick={handleStringify}
          className="btn"
          disabled={status !== "valid" || isStringifiedInput}
          title={isStringifiedInput ? "Input is already stringified JSON" : "Wrap as an escaped JSON string"}
        >
          Stringify
        </button>
        <button
          onClick={handleRepair}
          className={`btn ${viewMode === "repair" ? "btn-active" : ""}`}
          disabled={raw.trim() === ""}
          title="Fix broken JSON (quotes, commas, comments, truncated input…) and show what changed"
        >
          Repair
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
        <span className="path-bar-label">{effectiveParsed?.ok && effectiveParsed.kind === "xml" ? "XML path" : "JSON path"}</span>
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

        {status === "invalid" && viewMode !== "repair" && parsed && !parsed.ok && (
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
                {raw.split("\n").map((line, i) => {
                  if (i + 1 !== parsed.line) {
                    return (
                      <div key={i} className="code-line">
                        {line || " "}
                      </div>
                    );
                  }
                  // Only the character the parser actually stopped at is marked (columns are
                  // 1-based); the rest of the line keeps its normal color.
                  const at = Math.max(0, parsed.col - 1);
                  return (
                    <div key={i} className="code-line err">
                      {line.slice(0, at)}
                      <span className="err-mark">{line.charAt(at) || " "}</span>
                      {line.slice(at + 1)}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {viewMode === "repair" && repairResult && repairResult.source === raw && (
          <RepairView outcome={repairResult} onApply={handleApplyRepair} onBack={() => setViewMode("tree")} />
        )}

        {status === "valid" && effectiveParsed && effectiveParsed.ok && viewMode === "tree" && effectiveParsed.kind === "json" && (
          <JsonTree
            data={effectiveParsed.value as JsonValue}
            collapsedPaths={collapsedPaths}
            onToggle={handleToggleNode}
            showFullPath={showFullPath}
            activePath={activePath}
            onSelectPath={handleSelectPathFromTree}
          />
        )}

        {status === "valid" && effectiveParsed && effectiveParsed.ok && viewMode === "tree" && effectiveParsed.kind === "xml" && (
          <XmlTree
            root={effectiveParsed.posRoot}
            rootTag={effectiveParsed.rootLabel}
            collapsedPaths={collapsedPaths}
            onToggle={handleToggleNode}
            showFullPath={showFullPath}
            activePath={activePath}
            onSelectPath={handleSelectPathFromTree}
          />
        )}

        {status === "valid" && effectiveParsed && effectiveParsed.ok && viewMode === "graph" && (
          <GraphView
            data={effectiveParsed.value as JsonValue}
            rootLabel={effectiveParsed.rootLabel}
            onSelectPath={handleSelectPathFromTree}
          />
        )}

        {status === "valid" && parsed && parsed.ok && viewMode === "text" && (
          <div className="output-text-wrap">
            <div className="output-text-banner">
              Showing the result of {outputLabel} — Copy/Download reflect this.
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
