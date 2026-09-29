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

const BOX_WIDTH = 240;
const H_GAP = 36;
const V_GAP = 60;
const HEADER_HEIGHT = 34;
const ROW_HEIGHT = 20;
const PADDING_V = 14;
const MIN_HEIGHT = 56;

function boxHeight(node: EntityNode): number {
  return Math.max(MIN_HEIGHT, HEADER_HEIGHT + Math.max(node.fields.length, 1) * ROW_HEIGHT + PADDING_V);
}

export function computeGraphLayout(root: EntityNode): GraphLayout {
  const subtreeWidthCache = new Map<string, number>();
  function subtreeWidth(node: EntityNode): number {
    const cached = subtreeWidthCache.get(node.id);
    if (cached !== undefined) return cached;
    let w: number;
    if (node.children.length === 0) {
      w = BOX_WIDTH;
    } else {
      const childrenTotal =
        node.children.reduce((sum, c) => sum + subtreeWidth(c), 0) + H_GAP * (node.children.length - 1);
      w = Math.max(BOX_WIDTH, childrenTotal);
    }
    subtreeWidthCache.set(node.id, w);
    return w;
  }

  const maxHeightByDepth: number[] = [];
  function scanDepths(node: EntityNode, depth: number) {
    const h = boxHeight(node);
    maxHeightByDepth[depth] = Math.max(maxHeightByDepth[depth] ?? 0, h);
    node.children.forEach((c) => scanDepths(c, depth + 1));
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
    const height = boxHeight(node);
    const box: LayoutBox = { node, x: centerX - BOX_WIDTH / 2, y: yByDepth[depth], width: BOX_WIDTH, height };
    boxes.push(box);
    if (parentBox) edges.push({ from: parentBox, to: box });
    let cursor = leftEdge;
    node.children.forEach((child) => {
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
