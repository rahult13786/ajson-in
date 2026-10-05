import { jsonrepair, JSONRepairError } from "jsonrepair";
import { diffChars, diffLines } from "diff";

export interface DiffSegment {
  kind: "same" | "add" | "del";
  text: string;
}

export type RepairOutcome =
  | {
      ok: true;
      source: string;
      repaired: string;
      /** JSON.stringify(JSON.parse(repaired), null, 2) — or `repaired` as-is if it isn't one JSON value. */
      formatted: string;
      segments: DiffSegment[];
      insertions: number;
      deletions: number;
      changed: boolean;
    }
  | {
      ok: false;
      source: string;
      message: string;
      position: number | null;
      line: number | null;
      col: number | null;
    };

/** Above this size a per-character diff gets slow, so fall back to a (coarser) per-line diff. */
const CHAR_DIFF_LIMIT = 150_000;

function positionToLineCol(text: string, position: number): { line: number; col: number } {
  const before = text.slice(0, position);
  const lines = before.split("\n");
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

/**
 * Repairs broken JSON with `jsonrepair` (bundled, runs fully in the browser) and works out what
 * changed. `jsonrepair` only returns the fixed string, not a list of edits, so the edits are
 * recovered by diffing the *raw input* against the *repaired text* — deliberately BEFORE any
 * pretty-printing, otherwise whitespace changes would drown out the real fixes. The formatted
 * result is produced separately.
 */
export function repairJson(source: string): RepairOutcome {
  let repaired: string;
  try {
    repaired = jsonrepair(source);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not repair this input.";
    const position = err instanceof JSONRepairError ? err.position : null;
    const lc = position !== null ? positionToLineCol(source, position) : null;
    return { ok: false, source, message, position, line: lc?.line ?? null, col: lc?.col ?? null };
  }

  const parts =
    source.length + repaired.length > CHAR_DIFF_LIMIT ? diffLines(source, repaired) : diffChars(source, repaired);

  const segments: DiffSegment[] = parts.map((p) => ({
    kind: p.added ? "add" : p.removed ? "del" : "same",
    text: p.value,
  }));
  const insertions = segments.filter((s) => s.kind === "add").length;
  const deletions = segments.filter((s) => s.kind === "del").length;

  let formatted = repaired;
  try {
    formatted = JSON.stringify(JSON.parse(repaired), null, 2);
  } catch {
    // Not a single JSON value (shouldn't normally happen after repair) — show the repaired text.
  }

  return { ok: true, source, repaired, formatted, segments, insertions, deletions, changed: repaired !== source };
}
