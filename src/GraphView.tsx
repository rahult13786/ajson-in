import { useMemo, useRef, useState, type WheelEvent } from "react";
import { buildEntityTree, computeGraphLayout, type LayoutBox } from "./graphLayout";
import type { JsonValue } from "./jsonUtils";
import { ImageDownloadIcon } from "./icons";
import { exportNodeAsPng } from "./exportPng";

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.15;
const CANVAS_PADDING = 40;

export default function GraphView({
  data,
  rootLabel = "root",
  onSelectPath,
}: {
  data: JsonValue;
  rootLabel?: string;
  onSelectPath?: (path: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const layout = useMemo(() => {
    const tree = buildEntityTree(data, "root", rootLabel);
    return computeGraphLayout(tree);
  }, [data, rootLabel]);

  function zoomBy(delta: number) {
    setZoom((z) => Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z + delta)) * 100) / 100);
  }

  function handleWheel(e: WheelEvent<HTMLDivElement>) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoomBy(e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP);
  }

  async function copyEntity(box: LayoutBox) {
    await navigator.clipboard.writeText(JSON.stringify(box.node.ownData, null, 2));
    setCopiedId(`own:${box.node.id}`);
    setTimeout(() => setCopiedId((c) => (c === `own:${box.node.id}` ? null : c)), 1200);
  }

  async function copySubtree(box: LayoutBox) {
    await navigator.clipboard.writeText(JSON.stringify(box.node.fullData, null, 2));
    setCopiedId(`full:${box.node.id}`);
    setTimeout(() => setCopiedId((c) => (c === `full:${box.node.id}` ? null : c)), 1200);
  }

  async function handleExportPng() {
    if (!canvasRef.current) return;
    setExporting(true);
    setExportError(false);
    try {
      const bg = getComputedStyle(document.documentElement).getPropertyValue("--panel-alt").trim() || "#0d1017";
      // Pass the layout's own (unscaled) dimensions rather than measuring the live DOM node:
      // the node is currently rendered with a CSS `transform: scale(zoom)`, so its bounding
      // rect reflects the current zoom level, not its true content size — using that rect
      // while also resetting the clone's transform (needed for a crisp, unscaled export)
      // produced a size mismatch that silently broke the export.
      await exportNodeAsPng(canvasRef.current, "json-graph.png", bg || "#0d1017", canvasWidth, canvasHeight);
    } catch (err) {
      console.error("Graph PNG export failed:", err);
      setExportError(true);
      setTimeout(() => setExportError(false), 3000);
    } finally {
      setExporting(false);
    }
  }

  const canvasWidth = layout.width + CANVAS_PADDING * 2;
  const canvasHeight = layout.height + CANVAS_PADDING * 2;

  return (
    <div className="graph-view">
      <div className="graph-toolbar">
        <button type="button" className="btn" onClick={() => zoomBy(-ZOOM_STEP)} disabled={zoom <= ZOOM_MIN}>
          −
        </button>
        <span className="graph-zoom-readout">{Math.round(zoom * 100)}%</span>
        <button type="button" className="btn" onClick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX}>
          +
        </button>
        <button type="button" className="btn" onClick={() => setZoom(1)} disabled={zoom === 1}>
          Reset zoom
        </button>
        <span className="toolbar-divider" />
        <button type="button" className="btn icon-btn" onClick={handleExportPng} disabled={exporting} title="Export graph as PNG">
          <ImageDownloadIcon />
          {exporting ? "Exporting…" : "Export PNG"}
        </button>
        {exportError && <span className="graph-export-error">Export failed — see console</span>}
        <span className="graph-entity-count">{layout.boxes.length} entities</span>
      </div>

      <div className="graph-scroll-wrapper" ref={wrapperRef} onWheel={handleWheel}>
        <div className="graph-canvas-sizer" style={{ width: canvasWidth * zoom, height: canvasHeight * zoom }}>
          <div
            className="graph-canvas"
            ref={canvasRef}
            style={{ width: canvasWidth, height: canvasHeight, transform: `scale(${zoom})` }}
          >
            <svg className="graph-edges" width={canvasWidth} height={canvasHeight}>
              {layout.edges.map((e, i) => {
                const fromX = e.from.x + e.from.width / 2 + CANVAS_PADDING;
                const fromY = e.from.y + e.from.height + CANVAS_PADDING;
                const toX = e.to.x + e.to.width / 2 + CANVAS_PADDING;
                const toY = e.to.y + CANVAS_PADDING;
                const midY = (fromY + toY) / 2;
                const d = `M ${fromX} ${fromY} L ${fromX} ${midY} L ${toX} ${midY} L ${toX} ${toY}`;
                return <path key={i} d={d} className="graph-edge" />;
              })}
            </svg>

            {layout.boxes.map((box) => {
              const isRoot = box.node.path === "root";
              return (
                <div
                  key={box.node.id}
                  className={`entity-box ${isRoot ? "is-root" : ""}`}
                  style={{
                    left: box.x + CANVAS_PADDING,
                    top: box.y + CANVAS_PADDING,
                    width: box.width,
                    height: box.height,
                  }}
                >
                  <div className="entity-header">
                    <span
                      className="entity-label"
                      title={box.node.label}
                      onClick={() => onSelectPath?.(box.node.path)}
                      style={{ cursor: onSelectPath ? "pointer" : undefined }}
                    >
                      {box.node.label}
                    </span>
                    <div className="entity-actions">
                      <button
                        type="button"
                        className="entity-action-btn"
                        title="Copy this entity's JSON"
                        onClick={() => copyEntity(box)}
                      >
                        {copiedId === `own:${box.node.id}` ? "✓" : "⧉"}
                      </button>
                      <button
                        type="button"
                        className="entity-action-btn"
                        title="Copy full JSON (entity + children)"
                        onClick={() => copySubtree(box)}
                      >
                        {copiedId === `full:${box.node.id}` ? "✓" : "⧉⧉"}
                      </button>
                    </div>
                  </div>
                  <div className="entity-fields">
                    {box.node.fields.length === 0 && (
                      <div className="entity-field-empty">— nested entities only —</div>
                    )}
                    {box.node.fields.map((f) => (
                      <div className="entity-field" key={f.key}>
                        <span className="field-key" title={f.key}>
                          {f.key}
                        </span>
                        <span className={`field-value tok-${f.type}`} title={f.display}>
                          {f.display}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
