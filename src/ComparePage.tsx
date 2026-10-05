import { useMemo, useState } from "react";
import { usePersistedText } from "./draftsDb";
import ResizableSplit from "./ResizableSplit";
import { parsePayload } from "./payloadParser";
import { buildCompareRows, buildDiffSummaryLines } from "./compareUtils";
import CompareTree from "./CompareTree";
import { FavoritesBrowserModal } from "./FavoritesModal";
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, MaximizeIcon, MinimizeIcon } from "./icons";

const JSON_SAMPLE_LEFT = `{
  "id": "ord_88213",
  "status": "succeeded",
  "customer": { "id": "cus_9s6", "email": "jordan@example.com" },
  "amount": 4999,
  "tags": ["vip", "beta"]
}`;

const JSON_SAMPLE_RIGHT = `{
  "id": "ord_88213",
  "status": "pending",
  "customer": { "id": "cus_9s6", "email": "jordan@example.com", "verified": true },
  "amount": 4999
}`;

export default function ComparePage() {
  const [leftRaw, setLeftRaw] = usePersistedText("compare-left");
  const [rightRaw, setRightRaw] = usePersistedText("compare-right");
  const [activeDiffPos, setActiveDiffPos] = useState<number | null>(null);
  const [resultFullscreen, setResultFullscreen] = useState(false);
  const [showBrowseModal, setShowBrowseModal] = useState(false);

  const parsedLeft = useMemo(() => (leftRaw.trim() === "" ? null : parsePayload(leftRaw)), [leftRaw]);
  const parsedRight = useMemo(() => (rightRaw.trim() === "" ? null : parsePayload(rightRaw)), [rightRaw]);

  const compareResult = useMemo(() => {
    if (!parsedLeft?.ok || !parsedRight?.ok) return null;
    return buildCompareRows(parsedLeft.value, parsedRight.value);
  }, [parsedLeft, parsedRight]);

  const diffs = compareResult?.diffs ?? [];
  const activeRowId = activeDiffPos !== null && diffs[activeDiffPos] ? diffs[activeDiffPos].rowId : null;

  const stats = useMemo(() => {
    let missing = 0;
    let addition = 0;
    let changed = 0;
    for (const d of diffs) {
      if (d.type === "missing") missing++;
      else if (d.type === "addition") addition++;
      else changed++;
    }
    return { missing, addition, changed };
  }, [diffs]);

  function goToDiff(pos: number) {
    setActiveDiffPos(pos);
    const rowId = diffs[pos]?.rowId;
    if (rowId === undefined) return;
    requestAnimationFrame(() => {
      document.getElementById(`cmp-row-${rowId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  function handlePrev() {
    if (diffs.length === 0) return;
    const pos = activeDiffPos === null ? diffs.length - 1 : (activeDiffPos - 1 + diffs.length) % diffs.length;
    goToDiff(pos);
  }

  function handleNext() {
    if (diffs.length === 0) return;
    const pos = activeDiffPos === null ? 0 : (activeDiffPos + 1) % diffs.length;
    goToDiff(pos);
  }

  function handleDownloadSummary() {
    const lines = buildDiffSummaryLines(diffs);
    const text = lines.length > 0 ? lines.join("\n") : "No differences found.";
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "compare-summary.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  function loadSample() {
    setLeftRaw(JSON_SAMPLE_LEFT);
    setRightRaw(JSON_SAMPLE_RIGHT);
    setActiveDiffPos(null);
  }

  function handleClear() {
    setLeftRaw("");
    setRightRaw("");
    setActiveDiffPos(null);
  }

  // "My favorites" here only ever loads into the source (left) side — this page has no
  // "save" action of its own, just browse-and-load, per the round-7 request.
  function handleLoadFavorite(favRaw: string) {
    setLeftRaw(favRaw);
    setActiveDiffPos(null);
    setShowBrowseModal(false);
  }

  const leftKind = parsedLeft?.ok ? parsedLeft.kind : null;
  const rightKind = parsedRight?.ok ? parsedRight.kind : null;

  const leftPane = (
    <section className="pane pane-left">
      <div className="pane-header">
        <h2>Source (left)</h2>
        <div className="toolbar">{leftKind && <span className="kind-pill">{leftKind}</span>}</div>
      </div>
      <textarea
        className="input-area cmp-input"
        spellCheck={false}
        placeholder="Paste the source JSON or XML payload here…"
        value={leftRaw}
        onChange={(e) => setLeftRaw(e.target.value)}
      />
      {parsedLeft && !parsedLeft.ok && (
        <div className="error-banner">
          <span className="error-label">{parsedLeft.kind === "xml" ? "XML error" : "SyntaxError"}</span>
          <span>
            {parsedLeft.message} — line {parsedLeft.line}, column {parsedLeft.col}
          </span>
        </div>
      )}
    </section>
  );

  const rightPane = (
    <section className="pane pane-right">
      <div className="pane-header">
        <h2>Target (right)</h2>
        <div className="toolbar">
          {rightKind && <span className="kind-pill">{rightKind}</span>}
        </div>
      </div>
      <textarea
        className="input-area cmp-input"
        spellCheck={false}
        placeholder="Paste the target JSON or XML payload here…"
        value={rightRaw}
        onChange={(e) => setRightRaw(e.target.value)}
      />
      {parsedRight && !parsedRight.ok && (
        <div className="error-banner">
          <span className="error-label">{parsedRight.kind === "xml" ? "XML error" : "SyntaxError"}</span>
          <span>
            {parsedRight.message} — line {parsedRight.line}, column {parsedRight.col}
          </span>
        </div>
      )}
    </section>
  );

  const inputsSection = (
    <div className="compare-inputs-wrapper">
      <ResizableSplit storageKey="compare-inputs" left={leftPane} right={rightPane} />
    </div>
  );

  const resultSection = (
    <div className="compare-output">
      <div className="pane-header">
        <h2>Differences</h2>
        <div className="toolbar">
          <div className="diff-stats">
            <span className="diff-badge diff-badge-removed">{stats.missing} missing</span>
            <span className="diff-badge diff-badge-added">{stats.addition} added</span>
            <span className="diff-badge diff-badge-changed">{stats.changed} changed</span>
          </div>
          <span className="toolbar-divider" />
          <button className="btn icon-btn" onClick={handleDownloadSummary} disabled={!compareResult}>
            <DownloadIcon />
            Download Summary
          </button>
          <div className="diff-nav-group">
            <button className="btn icon-btn icon-btn-only" onClick={handlePrev} disabled={diffs.length === 0} title="Previous difference">
              <ChevronLeftIcon />
            </button>
            <span className="diff-nav-readout">
              {activeDiffPos !== null ? `${activeDiffPos + 1} / ${diffs.length}` : `— / ${diffs.length}`}
            </span>
            <button className="btn icon-btn icon-btn-only" onClick={handleNext} disabled={diffs.length === 0} title="Next difference">
              <ChevronRightIcon />
            </button>
          </div>
          <button
            className="btn icon-btn icon-btn-only"
            onClick={() => setResultFullscreen((v) => !v)}
            title={resultFullscreen ? "Exit full screen" : "Full Screen"}
          >
            {resultFullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
          </button>
        </div>
      </div>
      <div className="cmp-columns-header">
        <div>Source</div>
        <div>Target</div>
      </div>
      <div className="output-area">
        {!compareResult && (
          <div className="empty-state">
            <span className="empty-glyph">⇄</span>
            <p>Paste valid JSON or XML on both sides to see a diff here.</p>
          </div>
        )}
        {compareResult && <CompareTree rows={compareResult.rows} activeRowId={activeRowId} />}
      </div>
    </div>
  );

  return (
    <>
      <div className="page-statusbar">
        <div className="status-pill">
          <span className="status-dot" />
          {compareResult
            ? `${diffs.length} difference${diffs.length === 1 ? "" : "s"} found`
            : "Paste two payloads to compare"}
        </div>
        <div className="toolbar">
          <button className="btn" onClick={loadSample}>
            Load sample
          </button>
          <button className="btn" onClick={() => setShowBrowseModal(true)}>
            My favorites
          </button>
          <button className="btn btn-ghost" onClick={handleClear} disabled={!leftRaw && !rightRaw}>
            Clear
          </button>
        </div>
      </div>

      <div className="compare-page">
        {resultFullscreen ? (
          <>
            <div className="panes-static" style={{ display: "none" }}>
              {inputsSection}
            </div>
            <div className="fullscreen-overlay">{resultSection}</div>
          </>
        ) : (
          // A draggable horizontal divider between the source/target inputs and the
          // Differences panel below, so the differences list can be scrolled/resized
          // independently of however tall the inputs happen to be.
          <ResizableSplit
            storageKey="compare-vertical"
            direction="column"
            min={15}
            max={75}
            defaultRatio={30}
            left={inputsSection}
            right={resultSection}
          />
        )}
      </div>

      {showBrowseModal && (
        <FavoritesBrowserModal onClose={() => setShowBrowseModal(false)} onLoad={handleLoadFavorite} />
      )}
    </>
  );
}
