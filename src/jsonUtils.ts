export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ParseResult =
  | { ok: true; value: JsonValue; formatted: string }
  | { ok: false; error: string; line: number; col: number };

export function tryParse(raw: string): ParseResult {
  try {
    const value = JSON.parse(raw) as JsonValue;
    return { ok: true, value, formatted: JSON.stringify(value, null, 2) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid JSON";
    const match = message.match(/position (\d+)/);
    let line = 1;
    let col = 1;
    if (match) {
      const pos = Number(match[1]);
      const upToPos = raw.slice(0, pos).split("\n");
      line = upToPos.length;
      col = upToPos[upToPos.length - 1].length + 1;
    }
    return { ok: false, error: message, line, col };
  }
}

/**
 * Detects a "double-encoded" JSON payload — a JSON *string* whose own content is itself valid
 * JSON (an object or array), e.g. pasting `"{\"id\":1}"` rather than `{"id":1}`. When that's
 * what the top-level parsed value is, returns the inner payload pretty-printed; otherwise null.
 * Used to auto-format the Formatter page's output side without requiring a button click.
 */
export function tryUnwrapJsonString(value: JsonValue): string | null {
  if (typeof value !== "string") return null;
  try {
    const inner = JSON.parse(value);
    if (inner !== null && typeof inner === "object") {
      return JSON.stringify(inner, null, 2);
    }
  } catch {
    // Not double-encoded JSON — an ordinary string value, nothing to unwrap.
  }
  return null;
}

export function isContainer(
  v: JsonValue
): v is JsonValue[] | { [key: string]: JsonValue } {
  return v !== null && typeof v === "object";
}

export function countKeys(value: JsonValue): number {
  if (Array.isArray(value)) {
    return value.reduce((sum: number, item) => sum + countKeys(item), 0);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, JsonValue>);
    return entries.reduce((sum, [, v]) => sum + 1 + countKeys(v), 0);
  }
  return 0;
}

export function byteSize(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Strips the leading "root" segment so paths read like real JSON access paths, e.g. "data.customer[0].id". */
export function formatPath(path: string): string {
  const stripped = path.replace(/^root\.?/, "");
  return stripped === "" ? "(root)" : stripped;
}

/**
 * Like formatPath, but for XML: the leading "root" segment isn't a synthetic JSON wrapper to
 * discard, it corresponds to the document's real root element — so it's substituted with the
 * actual root tag name instead of being stripped, e.g. "root.customer.email" -> "order.customer.email".
 */
export function formatXmlPath(path: string, rootTag: string): string {
  if (path === "root") return rootTag;
  if (path.startsWith("root.") || path.startsWith("root[")) {
    return rootTag + path.slice("root".length);
  }
  return path;
}

/** Picks the right path formatter for the payload kind at hand. */
export function formatPathForKind(path: string, kind: "json" | "xml", rootLabel: string): string {
  return kind === "xml" ? formatXmlPath(path, rootLabel) : formatPath(path);
}

/** Collects the path of every non-empty object/array in the tree — used to build a "collapse all" set. */
export function collectContainerPaths(
  value: JsonValue,
  path = "root",
  acc: string[] = []
): string[] {
  if (!isContainer(value)) return acc;
  const entries: [string, JsonValue][] = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value);
  if (entries.length > 0) {
    acc.push(path);
    for (const [k, v] of entries) {
      const childPath = Array.isArray(value) ? `${path}[${k}]` : `${path}.${k}`;
      collectContainerPaths(v, childPath, acc);
    }
  }
  return acc;
}
