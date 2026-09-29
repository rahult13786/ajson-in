import { isContainer, type JsonValue } from "./jsonUtils";

export type CompareRowKind = "same" | "left-only" | "right-only" | "changed" | "container";

export interface CompareRow {
  id: number;
  depth: number;
  kind: CompareRowKind;
  /** Rendered text for the left column at this row, or null for a blank/omitted cell. */
  left: string | null;
  /** Rendered text for the right column at this row, or null for a blank/omitted cell. */
  right: string | null;
  /** True when this row is one of the navigable "differences" (leaf-level missing/addition/changed). */
  isDiff: boolean;
  path: string;
}

export type DiffType = "missing" | "addition" | "changed";

export interface DiffSummaryEntry {
  type: DiffType;
  path: string;
  /** The CompareRow.id this entry corresponds to, for Next/Previous navigation. */
  rowId: number;
}

interface BuildCtx {
  rows: CompareRow[];
  diffs: DiffSummaryEntry[];
  nextId: number;
}

function preview(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "object") return Array.isArray(value) ? "[…]" : "{…}";
  return String(value);
}

function deepEqual(a: JsonValue, b: JsonValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function pushRow(
  ctx: BuildCtx,
  depth: number,
  kind: CompareRowKind,
  left: string | null,
  right: string | null,
  path: string,
  isDiff = false
): number {
  const id = ctx.nextId++;
  ctx.rows.push({ id, depth, kind, left, right, isDiff, path });
  return id;
}

function emitOneSided(
  ctx: BuildCtx,
  value: JsonValue,
  path: string,
  prefix: string,
  depth: number,
  side: "left" | "right"
) {
  const kind: CompareRowKind = side === "left" ? "left-only" : "right-only";
  if (isContainer(value)) {
    const isArray = Array.isArray(value);
    const openBr = isArray ? "[" : "{";
    const closeBr = isArray ? "]" : "}";
    pushRow(
      ctx,
      depth,
      kind,
      side === "left" ? `${prefix}${openBr}` : null,
      side === "right" ? `${prefix}${openBr}` : null,
      path
    );
    const entries: [string, JsonValue][] = isArray
      ? (value as JsonValue[]).map((v, i) => [String(i), v])
      : Object.entries(value as Record<string, JsonValue>);
    for (const [k, v] of entries) {
      const childPath = isArray ? `${path}[${k}]` : `${path}.${k}`;
      const childPrefix = isArray ? "" : `"${k}": `;
      emitOneSided(ctx, v, childPath, childPrefix, depth + 1, side);
    }
    pushRow(ctx, depth, kind, side === "left" ? closeBr : null, side === "right" ? closeBr : null, path);
  } else {
    const rowId = pushRow(
      ctx,
      depth,
      kind,
      side === "left" ? `${prefix}${preview(value)}` : null,
      side === "right" ? `${prefix}${preview(value)}` : null,
      path,
      true
    );
    ctx.diffs.push({ type: side === "left" ? "missing" : "addition", path, rowId });
  }
}

function diffNode(
  ctx: BuildCtx,
  left: JsonValue | undefined,
  right: JsonValue | undefined,
  path: string,
  keyLabel: string | undefined,
  depth: number
) {
  const hasLeft = left !== undefined;
  const hasRight = right !== undefined;
  const prefix = keyLabel !== undefined ? `"${keyLabel}": ` : "";

  if (!hasLeft && !hasRight) return;

  if (hasLeft && !hasRight) {
    emitOneSided(ctx, left as JsonValue, path, prefix, depth, "left");
    return;
  }
  if (!hasLeft && hasRight) {
    emitOneSided(ctx, right as JsonValue, path, prefix, depth, "right");
    return;
  }

  const l = left as JsonValue;
  const r = right as JsonValue;
  const bothContainersOfSameKind = isContainer(l) && isContainer(r) && Array.isArray(l) === Array.isArray(r);

  if (bothContainersOfSameKind) {
    const isArray = Array.isArray(l);
    const openBr = isArray ? "[" : "{";
    const closeBr = isArray ? "]" : "}";
    pushRow(ctx, depth, "container", `${prefix}${openBr}`, `${prefix}${openBr}`, path);
    if (isArray) {
      const la = l as JsonValue[];
      const ra = r as JsonValue[];
      const len = Math.max(la.length, ra.length);
      for (let i = 0; i < len; i++) {
        diffNode(ctx, la[i], ra[i], `${path}[${i}]`, undefined, depth + 1);
      }
    } else {
      const lo = l as Record<string, JsonValue>;
      const ro = r as Record<string, JsonValue>;
      const keys = Array.from(new Set([...Object.keys(lo), ...Object.keys(ro)])).sort();
      for (const k of keys) {
        diffNode(ctx, lo[k], ro[k], `${path}.${k}`, k, depth + 1);
      }
    }
    pushRow(ctx, depth, "container", closeBr, closeBr, path);
    return;
  }

  if (deepEqual(l, r)) {
    pushRow(ctx, depth, "same", `${prefix}${preview(l)}`, `${prefix}${preview(r)}`, path);
  } else {
    const rowId = pushRow(ctx, depth, "changed", `${prefix}${preview(l)}`, `${prefix}${preview(r)}`, path, true);
    ctx.diffs.push({ type: "changed", path, rowId });
  }
}

export function buildCompareRows(
  left: JsonValue,
  right: JsonValue
): { rows: CompareRow[]; diffs: DiffSummaryEntry[] } {
  const ctx: BuildCtx = { rows: [], diffs: [], nextId: 0 };
  diffNode(ctx, left, right, "root", undefined, 0);
  return { rows: ctx.rows, diffs: ctx.diffs };
}

const TEMPLATES: Record<DiffType, (path: string) => string> = {
  missing: (path) => `target is missing the json path at given path ${path}`,
  addition: (path) => `target has addition the json path at given path ${path}`,
  changed: (path) => `target has different value than Source the json path at given path ${path}`,
};

export function buildDiffSummaryLines(diffs: DiffSummaryEntry[]): string[] {
  return diffs.map((d) => TEMPLATES[d.type](d.path));
}
