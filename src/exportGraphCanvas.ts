import type { GraphLayout, LayoutBox, LayoutEdge } from "./graphLayout";

/**
 * Renders the graph's boxes and edges straight onto a <canvas> with the Canvas 2D drawing
 * API, then reads the pixels out via `canvas.toBlob`.
 *
 * This replaces an earlier approach that screenshotted the live DOM node by wrapping it in an
 * SVG <foreignObject>, loading that as a data:/blob: URI into an <img>, and drawing the *image*
 * to the canvas. That technique depends on the browser agreeing to load an SVG-wrapped HTML
 * document as an image resource — which several real deployments (seen so far on both an
 * OpenShift and a Vercel deployment of this app) refuse for reasons that vary by browser/host
 * and are invisible to the page itself (the failure surfaces only as a bare `img.onerror`, with
 * no reason given). Drawing directly with `fillRect`/`fillText`/`strokeRect` has no such
 * dependency: it never loads anything as an image, so there is nothing for a browser, proxy or
 * security policy to refuse. It only uses the browser's own Canvas 2D API, which needs no
 * network access and no external resource load of any kind — genuinely 100% client-side with no
 * host-specific failure mode.
 */
export interface GraphExportTheme {
  panel: string;
  panelAlt: string;
  border: string;
  borderSoft: string;
  accent: string;
  accentDim: string;
  blue: string;
  green: string;
  purple: string;
  textMuted: string;
  textDim: string;
  fontMono: string;
}

const HEADER_HEIGHT = 34;
const ROW_HEIGHT = 20;
const FIELD_PAD_X = 10;
const RADIUS = 8;

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Trims `text` (with a trailing "…") until it fits `maxWidth` at the canvas's current font. */
function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = `${text.slice(0, mid)}…`;
    if (ctx.measureText(candidate).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? "…" : `${text.slice(0, lo)}…`;
}

function fieldColor(type: string, theme: GraphExportTheme): string {
  switch (type) {
    case "string":
      return theme.green;
    case "number":
      return theme.purple;
    case "bool":
      return theme.accent;
    default:
      return theme.textDim;
  }
}

function drawEdge(ctx: CanvasRenderingContext2D, edge: LayoutEdge, padding: number, theme: GraphExportTheme) {
  const fromX = edge.from.x + edge.from.width / 2 + padding;
  const fromY = edge.from.y + edge.from.height + padding;
  const toX = edge.to.x + edge.to.width / 2 + padding;
  const toY = edge.to.y + padding;
  const midY = (fromY + toY) / 2;

  ctx.strokeStyle = theme.textDim;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(fromX, midY);
  ctx.lineTo(toX, midY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
}

/** "⋯ N child boxes hidden" caption under a box whose children were hidden (matches the screen). */
function drawHiddenBadge(ctx: CanvasRenderingContext2D, box: LayoutBox, padding: number, theme: GraphExportTheme) {
  if (!box.childrenHidden) return;
  ctx.save();
  ctx.font = `italic 11px ${theme.fontMono}`;
  ctx.fillStyle = theme.textDim;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    `⋯ ${box.hiddenCount} child ${box.hiddenCount === 1 ? "box" : "boxes"} hidden`,
    box.x + padding + box.width / 2,
    box.y + padding + box.height + 14
  );
  ctx.restore();
}

function drawBox(ctx: CanvasRenderingContext2D, box: LayoutBox, padding: number, theme: GraphExportTheme, isRoot: boolean) {
  const x = box.x + padding;
  const y = box.y + padding;
  const { width, height } = box;

  // Card background + border (matches .entity-box / .entity-box.is-root)
  roundRectPath(ctx, x, y, width, height, RADIUS);
  ctx.fillStyle = theme.panel;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = isRoot ? theme.accentDim : theme.border;
  ctx.stroke();

  // Header strip (matches .entity-header)
  ctx.save();
  roundRectPath(ctx, x, y, width, height, RADIUS);
  ctx.clip();
  ctx.fillStyle = theme.panelAlt;
  ctx.fillRect(x, y, width, HEADER_HEIGHT);
  ctx.strokeStyle = theme.borderSoft;
  ctx.beginPath();
  ctx.moveTo(x, y + HEADER_HEIGHT + 0.5);
  ctx.lineTo(x + width, y + HEADER_HEIGHT + 0.5);
  ctx.stroke();
  ctx.restore();

  // Label (matches .entity-label / .entity-box.is-root .entity-label)
  ctx.textBaseline = "middle";
  ctx.font = `600 12px ${theme.fontMono}`;
  ctx.fillStyle = isRoot ? theme.accent : theme.blue;
  const labelMaxWidth = width - FIELD_PAD_X * 2;
  const labelText = truncateToWidth(ctx, box.node.label, labelMaxWidth);
  // Centered, like the on-screen header (where the name sits between the two button groups).
  ctx.textAlign = "center";
  ctx.fillText(labelText, x + width / 2, y + HEADER_HEIGHT / 2 + 1);
  ctx.textAlign = "left";

  if (box.collapsed) {
    drawHiddenBadge(ctx, box, padding, theme);
    return; // header-only box: no field list
  }

  // Fields (matches .entity-fields / .entity-field / .field-key / .field-value)
  ctx.font = `11.5px ${theme.fontMono}`;
  const fieldsTop = y + HEADER_HEIGHT + 6;
  const rowInnerWidth = width - FIELD_PAD_X * 2;

  if (box.node.fields.length === 0) {
    ctx.font = `italic 11px ${theme.fontMono}`;
    ctx.fillStyle = theme.textDim;
    ctx.fillText("— nested entities only —", x + FIELD_PAD_X, fieldsTop + 6);
    drawHiddenBadge(ctx, box, padding, theme);
    return;
  }

  box.node.fields.forEach((f, i) => {
    const rowY = fieldsTop + i * ROW_HEIGHT;
    const rowMidY = rowY + ROW_HEIGHT / 2 - 4;
    if (rowMidY > y + height - 4) return; // clipped by the box's own scroll area — skip overflow rows

    ctx.font = `11.5px ${theme.fontMono}`;
    ctx.fillStyle = theme.textMuted;
    const keyWidth = rowInnerWidth * 0.42;
    ctx.fillText(truncateToWidth(ctx, f.key, keyWidth), x + FIELD_PAD_X, rowMidY);

    ctx.fillStyle = fieldColor(f.type, theme);
    const valueMaxWidth = rowInnerWidth - keyWidth - 8;
    const valueText = truncateToWidth(ctx, f.display, valueMaxWidth);
    const valueWidth = ctx.measureText(valueText).width;
    ctx.fillText(valueText, x + width - FIELD_PAD_X - valueWidth, rowMidY);

    if (i < box.node.fields.length - 1) {
      ctx.strokeStyle = theme.borderSoft;
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + FIELD_PAD_X, rowY + ROW_HEIGHT - 2.5);
      ctx.lineTo(x + width - FIELD_PAD_X, rowY + ROW_HEIGHT - 2.5);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });
  drawHiddenBadge(ctx, box, padding, theme);
}

export async function exportGraphAsPng(
  layout: GraphLayout,
  filename: string,
  background: string,
  padding: number,
  theme: GraphExportTheme
): Promise<void> {
  const w = Math.max(1, Math.ceil(layout.width + padding * 2));
  const h = Math.max(1, Math.ceil(layout.height + padding * 2));

  const canvas = document.createElement("canvas");
  const scale = 2; // sharper export
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context is not available");
  ctx.scale(scale, scale);

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);

  layout.edges.forEach((edge) => drawEdge(ctx, edge, padding, theme));
  layout.boxes.forEach((box) => drawBox(ctx, box, padding, theme, box.node.path === "root"));

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Failed to encode PNG");

  const dlUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = dlUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(dlUrl);
}
