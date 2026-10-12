import { isContainer, type JsonValue } from "./jsonUtils";

export type FieldType = "string" | "number" | "bool" | "null" | "muted";

export interface FieldRow {
  key: string;
  raw: JsonValue;
  display: string;
  type: FieldType;
}

export interface EntityNode {
  id: string;
  path: string;
  label: string;
  fields: FieldRow[];
  children: EntityNode[];
  ownData: JsonValue;
  fullData: JsonValue;
}

function isPlainObjectContainer(v: JsonValue): v is { [key: string]: JsonValue } {
  return isContainer(v) && !Array.isArray(v);
}

function formatFieldValue(v: string | number | boolean | null): { display: string; type: FieldType } {
  if (v === null) return { display: "null", type: "null" };
  if (typeof v === "boolean") return { display: String(v), type: "bool" };
  if (typeof v === "number") return { display: String(v), type: "number" };
  const quoted = JSON.stringify(v);
  return { display: quoted.length > 46 ? `${quoted.slice(0, 43)}…"` : quoted, type: "string" };
}

function previewArray(v: JsonValue[]): string {
  const json = JSON.stringify(v);
  return json.length <= 42 ? json : `[${v.length} items]`;
}

export function buildEntityTree(value: JsonValue, path = "root", label = "root"): EntityNode {
  const fields: FieldRow[] = [];
  const children: EntityNode[] = [];
  const ownEntries: [string, JsonValue][] = [];

  function handleEntry(key: string, v: JsonValue, childPath: string, childLabel: string) {
    if (Array.isArray(v)) {
      if (v.length === 0) {
        fields.push({ key, raw: v, display: "[]", type: "muted" });
        ownEntries.push([key, v]);
        return;
      }
      const allContainers = v.every((item) => isContainer(item));
      if (allContainers) {
        v.forEach((item, i) => {
          children.push(buildEntityTree(item, `${childPath}[${i}]`, `${childLabel}[${i}]`));
        });
      } else {
        fields.push({ key, raw: v, display: previewArray(v), type: "muted" });
        ownEntries.push([key, v]);
      }
      return;
    }
    if (isPlainObjectContainer(v)) {
      if (Object.keys(v).length === 0) {
        fields.push({ key, raw: v, display: "{}", type: "muted" });
        ownEntries.push([key, v]);
      } else {
        children.push(buildEntityTree(v, childPath, childLabel));
      }
      return;
    }
    const f = formatFieldValue(v);
    fields.push({ key, raw: v, display: f.display, type: f.type });
    ownEntries.push([key, v]);
  }

  if (Array.isArray(value)) {
    value.forEach((item, i) => handleEntry(`[${i}]`, item, `${path}[${i}]`, `${label}[${i}]`));
  } else if (isPlainObjectContainer(value)) {
    Object.entries(value).forEach(([k, v]) => handleEntry(k, v, `${path}.${k}`, k));
  } else {
    const f = formatFieldValue(value);
    fields.push({ key: "(value)", raw: value, display: f.display, type: f.type });
    ownEntries.push(["(value)", value]);
  }

  const ownData: JsonValue = Array.isArray(value)
    ? ownEntries.map(([, v]) => v)
    : (Object.fromEntries(ownEntries) as JsonValue);

  return { id: path, path, label, fields, children, ownData, fullData: value };
}

export interface LayoutBox {
  node: EntityNode;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Header-only: the field list is hidden (children, if shown, are unaffected). */
  collapsed: boolean;
  /** This box's child boxes are removed from the diagram. */
  childrenHidden: boolean;
  /** How many descendant boxes are hidden because of `childrenHidden` (0 otherwise). */
  hiddenCount: number;
}

export interface LayoutEdge {
  from: LayoutBox;
  to: LayoutBox;
}

export interface GraphLayout {
  boxes: LayoutBox[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

export const BOX_WIDTH = 300;
const H_GAP = 36;
const V_GAP = 60;
const HEADER_HEIGHT = 34;
const ROW_HEIGHT = 20;
const PADDING_V = 14;
const MIN_HEIGHT = 56;
/** Header strip plus the box's own 1px borders. */
export const COLLAPSED_HEIGHT = HEADER_HEIGHT + 2;

function boxHeight(node: EntityNode, collapsed: boolean): number {
  if (collapsed) return COLLAPSED_HEIGHT;
  return Math.max(MIN_HEIGHT, HEADER_HEIGHT + Math.max(node.fields.length, 1) * ROW_HEIGHT + PADDING_V);
}

/**
 * Per-box view state, keyed by entity id (its JSON path):
 *  - `collapsed`: the box shows only its header (fields hidden), but stays in the diagram.
 *  - `hidden`: the box's *children* are removed from the diagram altogether.
 */
export interface GraphViewState {
  collapsed: Set<string>;
  hidden: Set<string>;
}

export const EMPTY_VIEW_STATE: GraphViewState = { collapsed: new Set(), hidden: new Set() };

export type BoxAction =
  | "collapse" // collapse this box only
  | "expand" // expand this box only
  | "collapseChildren" // collapse every descendant box; they stay visible (as collapsed boxes)
  | "expandChildren" // expand every descendant box and make them all visible
  | "collapseHide" // collapse this box and remove its children from the diagram
  | "expandShow"; // expand this box and bring its children back

function forEachDescendant(node: EntityNode, fn: (d: EntityNode) => void) {
  for (const c of node.children) {
    fn(c);
    forEachDescendant(c, fn);
  }
}

export function applyBoxAction(state: GraphViewState, node: EntityNode, action: BoxAction): GraphViewState {
  const collapsed = new Set(state.collapsed);
  const hidden = new Set(state.hidden);
  switch (action) {
    case "collapse":
      collapsed.add(node.id);
      break;
    case "expand":
      collapsed.delete(node.id);
      break;
    case "collapseChildren":
      hidden.delete(node.id); // children must be visible for "collapsed but visible"
      forEachDescendant(node, (d) => {
        collapsed.add(d.id);
        hidden.delete(d.id);
      });
      break;
    case "expandChildren":
      hidden.delete(node.id);
      forEachDescendant(node, (d) => {
        collapsed.delete(d.id);
        hidden.delete(d.id);
      });
      break;
    case "collapseHide":
      collapsed.add(node.id);
      hidden.add(node.id);
      break;
    case "expandShow":
      collapsed.delete(node.id);
      hidden.delete(node.id);
      break;
  }
  return { collapsed, hidden };
}

/** Which of a box's six actions currently make sense (drives the buttons' enabled state). */
export interface BoxActionAvailability {
  collapse: boolean;
  expand: boolean;
  collapseChildren: boolean;
  expandChildren: boolean;
  collapseHide: boolean;
  expandShow: boolean;
}

/**
 * One bottom-up pass over the whole tree computing, for every box, which actions would actually
 * change something — so the controls behave as logical toggles: a collapsed box offers "expand"
 * but not "collapse", a leaf has no hierarchy actions, "collapse children" is only on offer while
 * some descendant is still expanded or hidden, and so on.
 */
export function computeAvailability(root: EntityNode, state: GraphViewState): Map<string, BoxActionAvailability> {
  const out = new Map<string, BoxActionAvailability>();
  // needsCollapse / needsExpand describe the *descendants* (plus this box's own hidden flag).
  const needs = new Map<string, { collapse: boolean; expand: boolean }>();

  function visit(node: EntityNode) {
    node.children.forEach(visit);
    const hasKids = node.children.length > 0;
    const isHidden = state.hidden.has(node.id);
    const needCollapse =
      hasKids &&
      (isHidden || node.children.some((c) => !state.collapsed.has(c.id) || needs.get(c.id)!.collapse));
    const needExpand =
      hasKids &&
      (isHidden || node.children.some((c) => state.collapsed.has(c.id) || needs.get(c.id)!.expand));
    needs.set(node.id, { collapse: needCollapse, expand: needExpand });

    const isCollapsed = state.collapsed.has(node.id);
    out.set(node.id, {
      collapse: !isCollapsed,
      expand: isCollapsed,
      collapseChildren: needCollapse,
      expandChildren: needExpand,
      collapseHide: hasKids && !(isCollapsed && isHidden),
      expandShow: hasKids && (isCollapsed || isHidden),
    });
  }
  visit(root);
  return out;
}

export function countDescendants(node: EntityNode): number {
  let n = 0;
  forEachDescendant(node, () => n++);
  return n;
}

export function computeGraphLayout(root: EntityNode, view: GraphViewState = EMPTY_VIEW_STATE): GraphLayout {
  const visibleChildren = (node: EntityNode): EntityNode[] => (view.hidden.has(node.id) ? [] : node.children);

  const subtreeWidthCache = new Map<string, number>();
  function subtreeWidth(node: EntityNode): number {
    const cached = subtreeWidthCache.get(node.id);
    if (cached !== undefined) return cached;
    let w: number;
    const kids = visibleChildren(node);
    if (kids.length === 0) {
      w = BOX_WIDTH;
    } else {
      const childrenTotal = kids.reduce((sum, c) => sum + subtreeWidth(c), 0) + H_GAP * (kids.length - 1);
      w = Math.max(BOX_WIDTH, childrenTotal);
    }
    subtreeWidthCache.set(node.id, w);
    return w;
  }

  const maxHeightByDepth: number[] = [];
  function scanDepths(node: EntityNode, depth: number) {
    const h = boxHeight(node, view.collapsed.has(node.id));
    maxHeightByDepth[depth] = Math.max(maxHeightByDepth[depth] ?? 0, h);
    visibleChildren(node).forEach((c) => scanDepths(c, depth + 1));
  }
  scanDepths(root, 0);

  const yByDepth: number[] = [0];
  for (let d = 1; d < maxHeightByDepth.length; d++) {
    yByDepth[d] = yByDepth[d - 1] + maxHeightByDepth[d - 1] + V_GAP;
  }

  const boxes: LayoutBox[] = [];
  const edges: LayoutEdge[] = [];

  function place(node: EntityNode, leftEdge: number, depth: number, parentBox?: LayoutBox): LayoutBox {
    const w = subtreeWidth(node);
    const centerX = leftEdge + w / 2;
    const collapsed = view.collapsed.has(node.id);
    const childrenHidden = view.hidden.has(node.id) && node.children.length > 0;
    const height = boxHeight(node, collapsed);
    const box: LayoutBox = {
      node,
      x: centerX - BOX_WIDTH / 2,
      y: yByDepth[depth],
      width: BOX_WIDTH,
      height,
      collapsed,
      childrenHidden,
      hiddenCount: childrenHidden ? countDescendants(node) : 0,
    };
    boxes.push(box);
    if (parentBox) edges.push({ from: parentBox, to: box });
    let cursor = leftEdge;
    visibleChildren(node).forEach((child) => {
      const cw = subtreeWidth(child);
      place(child, cursor, depth + 1, box);
      cursor += cw + H_GAP;
    });
    return box;
  }

  place(root, 0, 0);

  const totalWidth = subtreeWidth(root);
  const maxDepth = maxHeightByDepth.length - 1;
  const totalHeight = yByDepth[maxDepth] + maxHeightByDepth[maxDepth];

  return { boxes, edges, width: totalWidth, height: totalHeight };
}
