import type { JsonValue } from "./jsonUtils";
import type { PosNode } from "./jsonPositions";

export type ParseXmlResult =
  | { ok: true; root: PosNode; rootTag: string }
  | { ok: false; message: string; pos: number };

class XmlParseError extends Error {
  pos: number;
  constructor(message: string, pos: number) {
    super(message);
    this.pos = pos;
  }
}

interface RawAttr {
  name: string;
  value: string;
  nameStart: number;
  nameEnd: number;
  valueStart: number;
  valueEnd: number;
}

interface RawElement {
  tag: string;
  tagNameStart: number;
  tagNameEnd: number;
  start: number;
  end: number;
  attrs: RawAttr[];
  children: RawElement[];
  text: string;
}

/**
 * Hand-rolled recursive-descent XML parser (no DOMParser dependency, so behavior is
 * identical however the app is hosted). Tracks character offsets for every tag name and
 * attribute so the rest of the app — tree view, graph, search, click-to-sync — can treat
 * an XML document exactly like a JSON one via the shared PosNode shape.
 */
export function parseXmlWithPositions(text: string): ParseXmlResult {
  const n = text.length;
  let i = 0;

  function fail(msg: string): never {
    throw new XmlParseError(msg, i);
  }
  function skipWs() {
    while (i < n && /\s/.test(text[i])) i++;
  }
  function isNameChar(ch: string) {
    return /[A-Za-z0-9_.:-]/.test(ch);
  }

  function skipMisc() {
    while (true) {
      skipWs();
      if (text.startsWith("<?", i)) {
        const end = text.indexOf("?>", i);
        if (end === -1) fail("Unterminated processing instruction");
        i = end + 2;
        continue;
      }
      if (text.startsWith("<!--", i)) {
        const end = text.indexOf("-->", i);
        if (end === -1) fail("Unterminated comment");
        i = end + 3;
        continue;
      }
      if (text.startsWith("<!DOCTYPE", i) || text.startsWith("<!doctype", i)) {
        const end = text.indexOf(">", i);
        if (end === -1) fail("Unterminated doctype");
        i = end + 1;
        continue;
      }
      break;
    }
  }

  function readName(): { name: string; start: number; end: number } {
    const start = i;
    while (i < n && isNameChar(text[i])) i++;
    if (i === start) fail("Expected a name");
    return { name: text.slice(start, i), start, end: i };
  }

  function readAttrs(): RawAttr[] {
    const attrs: RawAttr[] = [];
    while (true) {
      skipWs();
      if (i >= n || text[i] === ">" || text[i] === "/" || text[i] === "?") break;
      const nameTok = readName();
      skipWs();
      if (text[i] !== "=") fail("Expected '=' in attribute");
      i++;
      skipWs();
      const quote = text[i];
      if (quote !== '"' && quote !== "'") fail("Expected quoted attribute value");
      i++;
      const valueStart = i;
      while (i < n && text[i] !== quote) i++;
      if (i >= n) fail("Unterminated attribute value");
      const value = text.slice(valueStart, i);
      const valueEnd = i;
      i++; // closing quote
      attrs.push({ name: nameTok.name, value, nameStart: nameTok.start, nameEnd: nameTok.end, valueStart, valueEnd });
    }
    return attrs;
  }

  function readText(): string {
    const start = i;
    while (i < n && text[i] !== "<") i++;
    return text.slice(start, i);
  }

  function decodeEntities(s: string): string {
    return s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  function parseElement(): RawElement {
    const start = i;
    if (text[i] !== "<") fail("Expected '<'");
    i++;
    const tagTok = readName();
    const attrs = readAttrs();
    skipWs();
    if (text.startsWith("/>", i)) {
      i += 2;
      return { tag: tagTok.name, tagNameStart: tagTok.start, tagNameEnd: tagTok.end, start, end: i, attrs, children: [], text: "" };
    }
    if (text[i] !== ">") fail("Expected '>' or '/>'");
    i++;

    const children: RawElement[] = [];
    let textContent = "";
    while (true) {
      if (i >= n) fail(`Unterminated element <${tagTok.name}>`);
      if (text.startsWith("<![CDATA[", i)) {
        const end = text.indexOf("]]>", i);
        if (end === -1) fail("Unterminated CDATA section");
        textContent += text.slice(i + 9, end);
        i = end + 3;
        continue;
      }
      if (text.startsWith("<!--", i)) {
        const end = text.indexOf("-->", i);
        if (end === -1) fail("Unterminated comment");
        i = end + 3;
        continue;
      }
      if (text.startsWith("</", i)) {
        const closeStart = i;
        i += 2;
        const closeTag = readName();
        skipWs();
        if (text[i] !== ">") fail("Expected '>' in closing tag");
        i++;
        if (closeTag.name !== tagTok.name) {
          fail(`Mismatched closing tag: expected </${tagTok.name}>, found </${closeTag.name}>`);
        }
        void closeStart;
        break;
      }
      if (text[i] === "<") {
        children.push(parseElement());
        continue;
      }
      textContent += readText();
    }

    return {
      tag: tagTok.name,
      tagNameStart: tagTok.start,
      tagNameEnd: tagTok.end,
      start,
      end: i,
      attrs,
      children,
      text: decodeEntities(textContent),
    };
  }

  try {
    skipMisc();
    if (i >= n || text[i] !== "<") fail("Expected root element");
    const rootEl = parseElement();
    skipMisc();
    if (i < n) fail("Unexpected trailing content after root element");
    const posRoot = elementToPosNode(rootEl, "root");
    return { ok: true, root: posRoot, rootTag: rootEl.tag };
  } catch (err) {
    if (err instanceof XmlParseError) return { ok: false, message: err.message, pos: err.pos };
    return { ok: false, message: err instanceof Error ? err.message : "Invalid XML", pos: i };
  }
}

/**
 * Converts one parsed XML element into a PosNode, using synthetic keys so the rest of the
 * app can treat it exactly like a JSON object: attributes become "@name" entries, text
 * content becomes a "#text" entry, and repeated child tags become an indexed path
 * ("items.item[0]", "items.item[1]", ...).
 */
function elementToPosNode(el: RawElement, path: string): PosNode {
  const children: PosNode[] = [];
  const valueObj: Record<string, JsonValue> = {};

  for (const attr of el.attrs) {
    const attrKey = `@${attr.name}`;
    const attrPath = `${path}.${attrKey}`;
    children.push({
      value: attr.value,
      path: attrPath,
      keyName: attrKey,
      keyStart: attr.nameStart,
      keyEnd: attr.nameEnd,
      valueStart: attr.valueStart,
      valueEnd: attr.valueEnd,
    });
    valueObj[attrKey] = attr.value;
  }

  const trimmedText = el.text.trim();
  if (trimmedText !== "") {
    const textPath = `${path}.#text`;
    children.push({
      value: trimmedText,
      path: textPath,
      keyName: "#text",
      keyStart: el.tagNameEnd,
      keyEnd: el.tagNameEnd,
      valueStart: el.tagNameEnd,
      valueEnd: el.tagNameEnd,
    });
    valueObj["#text"] = trimmedText;
  }

  const countByTag = new Map<string, number>();
  for (const child of el.children) countByTag.set(child.tag, (countByTag.get(child.tag) ?? 0) + 1);
  const seenByTag = new Map<string, number>();

  for (const child of el.children) {
    const total = countByTag.get(child.tag) ?? 1;
    const idx = seenByTag.get(child.tag) ?? 0;
    seenByTag.set(child.tag, idx + 1);
    const isRepeated = total > 1;
    const childKey = child.tag;
    const childPath = isRepeated ? `${path}.${childKey}[${idx}]` : `${path}.${childKey}`;
    const childNode = elementToPosNode(child, childPath);
    childNode.keyName = childKey;
    childNode.keyStart = child.tagNameStart;
    childNode.keyEnd = child.tagNameEnd;
    children.push(childNode);

    if (isRepeated) {
      const existing = valueObj[childKey];
      const arr = Array.isArray(existing) ? existing : [];
      arr[idx] = childNode.value;
      valueObj[childKey] = arr;
    } else {
      valueObj[childKey] = childNode.value;
    }
  }

  // A leaf-like element with only text (no attrs, no children) simplifies to a bare string,
  // matching how JSON would represent a scalar field.
  const hasOnlyText = el.attrs.length === 0 && el.children.length === 0;
  const value: JsonValue = hasOnlyText ? trimmedText : valueObj;

  return {
    value,
    path,
    valueStart: el.start,
    valueEnd: el.end,
    children: children.length > 0 ? children : [],
  };
}

const INDENT = "  ";

/** Pretty-prints an XML document from scratch (2-space indent, one tag per line). */
export function prettyPrintXml(raw: string): string {
  const result = parseXmlWithPositions(raw);
  if (!result.ok) return raw;
  // Preserve a leading <?xml ...?> declaration verbatim — it isn't part of the element tree,
  // so the tree-based serializer below would otherwise silently drop it.
  const declMatch = raw.match(/^\s*(<\?xml[^>]*\?>)/i);
  const decl = declMatch ? `${declMatch[1]}\n` : "";
  return decl + serializePosXmlPretty(result.root, 0, result.rootTag);
}

function escapeXmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeXmlAttr(s: string): string {
  return escapeXmlText(s).replace(/"/g, "&quot;");
}

function serializePosXmlPretty(node: PosNode, depth: number, tagOverride?: string): string {
  const pad = INDENT.repeat(depth);
  const tag = tagOverride ?? node.keyName ?? "node";
  const attrs: string[] = [];
  const elementChildren: PosNode[] = [];
  let text = "";

  for (const child of node.children ?? []) {
    if (child.keyName?.startsWith("@")) {
      attrs.push(`${child.keyName.slice(1)}="${escapeXmlAttr(String(child.value))}"`);
    } else if (child.keyName === "#text") {
      text = String(child.value);
    } else {
      elementChildren.push(child);
    }
  }

  const attrStr = attrs.length > 0 ? " " + attrs.join(" ") : "";

  if (elementChildren.length === 0 && text === "") {
    return `${pad}<${tag}${attrStr}/>`;
  }
  if (elementChildren.length === 0) {
    return `${pad}<${tag}${attrStr}>${escapeXmlText(text)}</${tag}>`;
  }
  const childLines = elementChildren.map((c) => serializePosXmlPretty(c, depth + 1));
  const textLine = text !== "" ? `${INDENT.repeat(depth + 1)}${escapeXmlText(text)}\n` : "";
  return `${pad}<${tag}${attrStr}>\n${textLine}${childLines.join("\n")}\n${pad}</${tag}>`;
}

/** Minifies XML by stripping insignificant whitespace between tags. */
export function minifyXml(raw: string): string {
  return raw
    .replace(/>\s+</g, "><")
    .replace(/^\s+|\s+$/g, "")
    .replace(/\n/g, "");
}
