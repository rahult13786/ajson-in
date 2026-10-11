import { useCallback, useEffect, useRef, useState } from "react";
import Dexie, { type Table } from "dexie";

/**
 * "Last pasted data" storage, client-side only (IndexedDB via Dexie). Each paste box in the app
 * owns exactly one record keyed by a stable id, so saving new text always *replaces* the
 * previous text for that box — there is never more than one stored instance per text area.
 */
export type DraftKey = "inspector" | "compare-left" | "compare-right" | "search";

interface DraftRecord {
  key: DraftKey;
  text: string;
  updatedAt: string;
}

class DraftsDatabase extends Dexie {
  drafts!: Table<DraftRecord, DraftKey>;
  constructor() {
    super("payload-inspector-drafts-db");
    this.version(1).stores({ drafts: "key" });
  }
}

const draftsDb = new DraftsDatabase();

async function loadDraft(key: DraftKey): Promise<string> {
  try {
    return (await draftsDb.drafts.get(key))?.text ?? "";
  } catch {
    return ""; // IndexedDB unavailable (e.g. blocked in a private window) — just start empty.
  }
}

async function saveDraft(key: DraftKey, text: string): Promise<void> {
  try {
    await draftsDb.drafts.put({ key, text, updatedAt: new Date().toISOString() });
  } catch {
    // Storage unavailable or full — the app keeps working, the text just isn't persisted.
  }
}

const SAVE_DEBOUNCE_MS = 250;

/**
 * Line endings are normalized to "\n" for every paste box, whatever way the text arrives
 * (typing, paste, "Upload file", a favorite, or a stored draft). A textarea's own value never
 * contains "\r" — browsers strip it — so a payload held in app state with Windows (CRLF) line
 * endings has every character offset skewed by one per preceding line relative to what the
 * textarea reports. That broke click-to-select: the highlight started a few characters late and
 * spilled onto the next line near the top of a file, and landed nowhere at all (or on the wrong
 * node) deep into it. Keeping state identical to the textarea's value makes parser offsets and
 * selection offsets the same thing on every OS and browser.
 */
export function normalizeNewlines(text: string): string {
  return text.indexOf("\r") === -1 ? text : text.replace(/\r\n?/g, "\n");
}

/**
 * Drop-in replacement for `useState("")` for a paste box: the value is restored from IndexedDB
 * when the page mounts (so switching tabs or reopening the browser brings the last data back)
 * and every change is written back, debounced while typing and flushed immediately when the
 * page unmounts or the tab is hidden/closed so the last keystrokes are never lost.
 */
export function usePersistedText(key: DraftKey): [string, (next: string) => void] {
  const [value, setValue] = useState("");
  const latest = useRef("");
  const dirty = useRef(false);
  const timer = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (!dirty.current) return;
    dirty.current = false;
    void saveDraft(key, latest.current);
  }, [key]);

  useEffect(() => {
    let cancelled = false;
    loadDraft(key).then((text) => {
      // If the user already typed/loaded something before the stored copy arrived, theirs wins.
      if (cancelled || dirty.current) return;
      const normalized = normalizeNewlines(text);
      latest.current = normalized;
      setValue(normalized);
    });
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", onHide);
      flush();
    };
  }, [key, flush]);

  const update = useCallback(
    (raw: string) => {
      const next = normalizeNewlines(raw);
      latest.current = next;
      dirty.current = true;
      setValue(next);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush]
  );

  return [value, update];
}
