import { Fragment, useMemo, useRef, useState, type WheelEvent } from "react";
import {
  applyBoxAction,
  buildEntityTree,
  computeAvailability,
  computeGraphLayout,
  EMPTY_VIEW_STATE,
  type BoxAction,
  type BoxActionAvailability,
  type EntityNode,
  type GraphViewState,
} from "./graphLayout";
import type { JsonValue } from "./jsonUtils";
import {
  BoxCollapseIcon,
  BoxExpandIcon,
  EyeIcon,
  EyeOffIcon,
  ImageDownloadIcon,
  TreeCollapseIcon,
  TreeExpandIcon,
} from "./icons";
import { exportGraphAsPng, type GraphExportTheme } from "./exportGraphCanvas";

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.15;
const CANVAS_PADDING = 40;

/**
 * The six per-box controls. Expand-type actions sit on the left of the box name and
 * collapse-type actions on the right, each group ordered so the single-box action is nearest the
 * name. `key` ties each control to its entry in `BoxActionAvailability` (its logical-toggle
 * enabled state).
 */
const LEFT_ACTIONS: { action: BoxAction; title: string; icon: JSX.Element }[] = [
  { action: "expandShow", title: "Expand this box and show its child boxes", icon: <EyeIcon /> },
  { action: "expandChildren", title: "Expand the whole child hierarchy (every child box expanded)", icon: <TreeExpandIcon /> },
  { action: "expand", title: "Expand this box", icon: <BoxExpandIcon /> },
];
const RIGHT_ACTIONS: { action: BoxAction; title: string; icon: JSX.Element }[] = [
  { action: "collapse", title: "Collapse this box", icon: <BoxCollapseIcon /> },
  { action: "collapseChildren", title: "Collapse the whole child hierarchy (child boxes stay visible, collapsed)", icon: <TreeCollapseIcon /> },
  { action: "collapseHide", title: "Collapse this box and hide its child boxes", icon: <EyeOffIcon /> },
];

function ActionButtons({
  node,
  availability,
  actions,
  onAction,
}: {
  node: EntityNode;
  availability: BoxActionAvailability | undefined;
  actions: typeof LEFT_ACTIONS;
  onAction: (node: EntityNode, action: BoxAction) => void;
}) {
  return (
    <div className="entity-actions">
      {actions.map(({ action, title, icon }) => (
        <button
          key={action}
          type="button"
          className="entity-action-btn"
          title={title}
          aria-label={title}
          disabled={!availability?.[action]}
          onClick={(e) => {
            e.stopPropagation(); // don't also count as a click on the box (selection)
            onAction(node, action);
          }}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

export default function GraphView({
  data,
  rootLabel = "root",
  onSelectPath,
  activePath = null,
}: {
  data: JsonValue;
  rootLabel?: string;
  /** Called with a box's JSON path when the box is clicked (used to highlight it in the input). */
  onSelectPath?: (path: string) => void;
  /** Path of the currently selected box, drawn with a highlight. */
  activePath?: string | null;
}) {
  const [zoom, setZoom] = useState(1);
  const [view, setView] = useState<GraphViewState>(EMPTY_VIEW_STATE);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const tree = useMemo(() => buildEntityTree(data, "root", rootLabel), [data, rootLabel]);
  const layout = useMemo(() => computeGraphLayout(tree, view), [tree, view]);
  const availability = useMemo(() => computeAvailability(tree, view), [tree, view]);
  const totalEntities = useMemo(() => {
    let n = 0;
    (function count(node: EntityNode) {
      n++;
      node.children.forEach(count);
    })(tree);
    return n;
  }, [tree]);

  function handleBoxAction(node: EntityNode, action: BoxAction) {
    setView((prev) => applyBoxAction(prev, node, action));
  }

  function zoomBy(delta: number) {
    setZoom((z) => Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z + delta)) * 100) / 100);
  }

  function handleWheel(e: WheelEvent<HTMLDivElement>) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoomBy(e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP);
  }

  async function handleExportPng() {
    setExporting(true);
    setExportError(null);
    try {
      const style = getComputedStyle(document.documentElement);
      const v = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
      const theme: GraphExportTheme = {
        panel: v("--panel", "#10141d"),
        panelAlt: v("--panel-alt", "#0d1017"),
        border: v("--border", "#232838"),
        borderSoft: v("--border-soft", "#1a1f2c"),
        accent: v("--accent", "#ffb454"),
        accentDim: v("--accent-dim", "#b98342"),
        blue: v("--blue", "#6cb6ff"),
        green: v("--green", "#7ee787"),
        purple: v("--purple", "#c9a8ff"),
        textMuted: v("--text-muted", "#7c8496"),
        textDim: v("--text-dim", "#4b5266"),
        fontMono: "SFMono-Regular, Consolas, monospace", // web font may be unavailable to canvas; use its fallback stack
      };
      // Drawn directly onto a <canvas> from the layout data (no DOM screenshot, no image
      // loading) — see exportGraphCanvas.ts for why that's more reliable across hosts.
      await exportGraphAsPng(layout, "json-graph.png", theme.panelAlt, CANVAS_PADDING, theme);
    } catch (err) {
      console.error("Graph PNG export failed:", err);
      const message = err instanceof Error ? err.message : "Export failed — see console";
      setExportError(message);
      setTimeout(() => setExportError((m) => (m === message ? null : m)), 8000);
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
        {exportError && <span className="graph-export-error">{exportError}</span>}
        <span className="graph-entity-count">
          {layout.boxes.length === totalEntities
            ? `${totalEntities} entities`
            : `${layout.boxes.length} of ${totalEntities} entities shown`}
        </span>
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
              const isActive = activePath === box.node.path;
              const avail = availability.get(box.node.id);
              return (
                <Fragment key={box.node.id}>
                  <div
                    className={`entity-box ${isRoot ? "is-root" : ""} ${isActive ? "is-active" : ""} ${
                      box.collapsed ? "is-collapsed" : ""
                    } ${onSelectPath ? "is-selectable" : ""}`}
                    data-path={box.node.path}
                    onClick={() => onSelectPath?.(box.node.path)}
                    style={{
                      left: box.x + CANVAS_PADDING,
                      top: box.y + CANVAS_PADDING,
                      width: box.width,
                      height: box.height,
                    }}
                  >
                    <div className="entity-header">
                      <ActionButtons node={box.node} availability={avail} actions={LEFT_ACTIONS} onAction={handleBoxAction} />
                      <span className="entity-label" title={box.node.label}>
                        {box.node.label}
                      </span>
                      <ActionButtons node={box.node} availability={avail} actions={RIGHT_ACTIONS} onAction={handleBoxAction} />
                    </div>
                    {!box.collapsed && (
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
                    )}
                  </div>
                  {box.childrenHidden && (
                    <div
                      className="entity-hidden-badge"
                      style={{ left: box.x + CANVAS_PADDING, top: box.y + CANVAS_PADDING + box.height + 6, width: box.width }}
                    >
                      ⋯ {box.hiddenCount} child {box.hiddenCount === 1 ? "box" : "boxes"} hidden
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
