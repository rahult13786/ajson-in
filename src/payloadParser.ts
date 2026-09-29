import { tryParse, type JsonValue } from "./jsonUtils";
import { parseJsonWithPositions, type PosNode } from "./jsonPositions";
import { parseXmlWithPositions, prettyPrintXml, minifyXml } from "./xmlPositions";

export type PayloadKind = "json" | "xml";

export type PayloadResult =
  | {
      ok: true;
      kind: PayloadKind;
      value: JsonValue;
      posRoot: PosNode;
      formatted: string;
      minified: string;
      /** The real root XML tag name (for "xml"), or "root" (for "json") — used to label the
       *  top of the tree/graph views so they reflect the actual document hierarchy rather
       *  than a generic placeholder. */
      rootLabel: string;
    }
  | { ok: false; kind: PayloadKind | "unknown"; message: string; line: number; col: number };

function lineColFromOffset(text: string, offset: number): { line: number; col: number } {
  const upTo = text.slice(0, offset).split("\n");
  return { line: upTo.length, col: upTo[upTo.length - 1].length + 1 };
}

/** Detects JSON vs XML and parses accordingly, producing a shape both pages can render uniformly. */
export function parsePayload(raw: string): PayloadResult {
  const trimmed = raw.trim();
  const looksLikeXml = trimmed.startsWith("<");

  if (!looksLikeXml) {
    const jsonPos = parseJsonWithPositions(raw);
    if (jsonPos.ok) {
      const jsonRes = tryParse(raw);
      const formatted = jsonRes.ok ? jsonRes.formatted : raw;
      const minified = jsonRes.ok ? JSON.stringify(jsonRes.value) : raw;
      return {
        ok: true,
        kind: "json",
        value: jsonPos.root.value,
        posRoot: jsonPos.root,
        formatted,
        minified,
        rootLabel: "root",
      };
    }
    // Fall through to try XML in case it's XML without a leading '<' due to stray whitespace/BOM.
    const xmlPos = parseXmlWithPositions(raw);
    if (xmlPos.ok) {
      return {
        ok: true,
        kind: "xml",
        value: xmlPos.root.value,
        posRoot: xmlPos.root,
        formatted: prettyPrintXml(raw),
        minified: minifyXml(raw),
        rootLabel: xmlPos.rootTag,
      };
    }
    const { line, col } = lineColFromOffset(raw, jsonPos.pos);
    return { ok: false, kind: "unknown", message: jsonPos.message, line, col };
  }

  const xmlPos = parseXmlWithPositions(raw);
  if (xmlPos.ok) {
    return {
      ok: true,
      kind: "xml",
      value: xmlPos.root.value,
      posRoot: xmlPos.root,
      formatted: prettyPrintXml(raw),
      minified: minifyXml(raw),
      rootLabel: xmlPos.rootTag,
    };
  }
  const { line, col } = lineColFromOffset(raw, xmlPos.pos);
  return { ok: false, kind: "xml", message: xmlPos.message, line, col };
}
