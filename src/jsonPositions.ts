import type { JsonValue } from "./jsonUtils";

export interface PosNode {
  value: JsonValue;
  path: string;
  keyName?: string;
  keyStart?: number;
  keyEnd?: number;
  valueStart: number;
  valueEnd: number;
  /** Present (possibly empty) for objects/arrays; absent for primitives — the cheap way to tell a leaf from a container. */
  children?: PosNode[];
}

export type ParsePositionsResult =
  | { ok: true; root: PosNode }
  | { ok: false; message: string; pos: number };

class PosParseError extends Error {
  pos: number;
  constructor(message: string, pos: number) {
    super(message);
    this.pos = pos;
  }
}

export function parseJsonWithPositions(text: string): ParsePositionsResult {
  const n = text.length;
  let i = 0;

  const isWs = (ch: string) => ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
  function skipWs() {
    while (i < n && isWs(text[i])) i++;
  }
  function fail(msg: string): never {
    throw new PosParseError(msg, i);
  }

  function parseRawString(): { value: string; start: number; end: number } {
    const start = i;
    if (text[i] !== '"') fail("Expected string");
    i++;
    while (i < n && text[i] !== '"') {
      if (text[i] === "\\") i += 2;
      else i++;
    }
    if (i >= n) fail("Unterminated string");
    i++;
    const raw = text.slice(start, i);
    let value: string;
    try {
      value = JSON.parse(raw);
    } catch {
      fail("Invalid string literal");
    }
    return { value, start, end: i };
  }

  function parseNumber(path: string): PosNode {
    const start = i;
    if (text[i] === "-") i++;
    while (i < n && text[i] >= "0" && text[i] <= "9") i++;
    if (text[i] === ".") {
      i++;
      while (i < n && text[i] >= "0" && text[i] <= "9") i++;
    }
    if (text[i] === "e" || text[i] === "E") {
      i++;
      if (text[i] === "+" || text[i] === "-") i++;
      while (i < n && text[i] >= "0" && text[i] <= "9") i++;
    }
    const raw = text.slice(start, i);
    if (raw === "" || raw === "-") fail("Invalid number");
    return { value: Number(raw), path, valueStart: start, valueEnd: i };
  }

  function parseObject(path: string): PosNode {
    const start = i;
    i++; // {
    const obj: Record<string, JsonValue> = {};
    const children: PosNode[] = [];
    skipWs();
    if (text[i] === "}") {
      i++;
      return { value: obj, path, valueStart: start, valueEnd: i, children };
    }
    while (true) {
      skipWs();
      if (text[i] !== '"') fail("Expected property name");
      const keyTok = parseRawString();
      skipWs();
      if (text[i] !== ":") fail("Expected ':' after property name");
      i++;
      skipWs();
      const childPath = `${path}.${keyTok.value}`;
      const child = parseValue(childPath);
      child.keyStart = keyTok.start;
      child.keyEnd = keyTok.end;
      child.keyName = keyTok.value;
      children.push(child);
      obj[keyTok.value] = child.value;
      skipWs();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "}") {
        i++;
        break;
      }
      fail("Expected ',' or '}'");
    }
    return { value: obj, path, valueStart: start, valueEnd: i, children };
  }

  function parseArray(path: string): PosNode {
    const start = i;
    i++; // [
    const arr: JsonValue[] = [];
    const children: PosNode[] = [];
    skipWs();
    if (text[i] === "]") {
      i++;
      return { value: arr, path, valueStart: start, valueEnd: i, children };
    }
    let idx = 0;
    while (true) {
      skipWs();
      const childPath = `${path}[${idx}]`;
      const child = parseValue(childPath);
      children.push(child);
      arr.push(child.value);
      idx++;
      skipWs();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "]") {
        i++;
        break;
      }
      fail("Expected ',' or ']'");
    }
    return { value: arr, path, valueStart: start, valueEnd: i, children };
  }

  function parseValue(path: string): PosNode {
    skipWs();
    const c = text[i];
    if (c === "{") return parseObject(path);
    if (c === "[") return parseArray(path);
    if (c === '"') {
      const s = parseRawString();
      return { value: s.value, path, valueStart: s.start, valueEnd: s.end };
    }
    if (c === "-" || (c >= "0" && c <= "9")) return parseNumber(path);
    if (text.startsWith("true", i)) {
      const start = i;
      i += 4;
      return { value: true, path, valueStart: start, valueEnd: i };
    }
    if (text.startsWith("false", i)) {
      const start = i;
      i += 5;
      return { value: false, path, valueStart: start, valueEnd: i };
    }
    if (text.startsWith("null", i)) {
      const start = i;
      i += 4;
      return { value: null, path, valueStart: start, valueEnd: i };
    }
    fail("Unexpected token");
  }

  try {
    skipWs();
    const root = parseValue("root");
    skipWs();
    if (i < n) fail("Unexpected trailing content");
    return { ok: true, root };
  } catch (err) {
    if (err instanceof PosParseError) return { ok: false, message: err.message, pos: err.pos };
    return { ok: false, message: err instanceof Error ? err.message : "Invalid JSON", pos: i };
  }
}

export interface KeyMatch {
  path: string;
  key: string;
  value: JsonValue;
  start: number;
  end: number;
  /** Whole-row span used to highlight the enclosing line/element, not just the key token. */
  rowStart: number;
  rowEnd: number;
}

export interface ValueMatch {
  path: string;
  key: string;
  preview: string;
  start: number;
  end: number;
  rowStart: number;
  rowEnd: number;
}

export function collectKeyMatches(root: PosNode, acc: KeyMatch[] = []): KeyMatch[] {
  if (root.keyStart !== undefined && root.keyEnd !== undefined && root.keyName !== undefined) {
    acc.push({
      path: root.path,
      key: root.keyName,
      value: root.value,
      start: root.keyStart,
      end: root.keyEnd,
      rowStart: root.keyStart,
      rowEnd: root.valueEnd,
    });
  }
  if (root.children) {
    for (const child of root.children) collectKeyMatches(child, acc);
  }
  return acc;
}

export function collectValueMatches(root: PosNode, acc: ValueMatch[] = []): ValueMatch[] {
  if (root.children === undefined) {
    const preview = typeof root.value === "string" ? root.value : JSON.stringify(root.value);
    acc.push({
      path: root.path,
      key: root.keyName ?? "",
      preview,
      start: root.valueStart,
      end: root.valueEnd,
      rowStart: root.keyStart ?? root.valueStart,
      rowEnd: root.valueEnd,
    });
  } else {
    for (const child of root.children) collectValueMatches(child, acc);
  }
  return acc;
}

/** Finds the deepest node whose value span contains the given character offset — used for click-to-sync highlighting. */
export function findNodeAtOffset(root: PosNode, offset: number): PosNode | null {
  const spanStart = root.keyStart ?? root.valueStart;
  if (offset < spanStart || offset > root.valueEnd) return null;
  if (root.children) {
    for (const child of root.children) {
      const hit = findNodeAtOffset(child, offset);
      if (hit) return hit;
    }
  }
  return root;
}

/** Finds the node whose path exactly matches — used for tree-click -> textarea navigation. */
export function findNodeAtPath(root: PosNode, path: string): PosNode | null {
  if (root.path === path) return root;
  if (root.children) {
    for (const child of root.children) {
      const hit = findNodeAtPath(child, path);
      if (hit) return hit;
    }
  }
  return null;
}
