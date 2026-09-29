import { useCallback, useRef, useState, type ReactNode } from "react";

interface ResizableSplitProps {
  left: ReactNode;
  right: ReactNode;
  storageKey?: string;
  min?: number;
  max?: number;
  defaultRatio?: number;
  direction?: "row" | "column";
}

/**
 * Two-pane layout with a draggable divider. Pure client-side, no deps: tracks the
 * split as a percentage in state (and optionally localStorage), driven by pointer events.
 */
export default function ResizableSplit({
  left,
  right,
  storageKey,
  min = 20,
  max = 80,
  defaultRatio = 50,
  direction = "row",
}: ResizableSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState<number>(() => {
    if (storageKey) {
      const stored = window.localStorage.getItem(`split:${storageKey}`);
      if (stored) {
        const n = Number(stored);
        if (!Number.isNaN(n)) return n;
      }
    }
    return defaultRatio;
  });
  const dragging = useRef(false);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pos = direction === "row" ? e.clientX - rect.left : e.clientY - rect.top;
      const size = direction === "row" ? rect.width : rect.height;
      let pct = (pos / size) * 100;
      pct = Math.min(max, Math.max(min, pct));
      setRatio(pct);
    },
    [direction, min, max]
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    if (storageKey) {
      setRatio((r) => {
        window.localStorage.setItem(`split:${storageKey}`, String(r));
        return r;
      });
    }
  }, [onPointerMove, storageKey]);

  function onPointerDown() {
    dragging.current = true;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    document.body.style.cursor = direction === "row" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  }

  function onHandleKeyDown(e: React.KeyboardEvent) {
    const step = 2;
    if (direction === "row" && e.key === "ArrowLeft") setRatio((r) => Math.max(min, r - step));
    if (direction === "row" && e.key === "ArrowRight") setRatio((r) => Math.min(max, r + step));
    if (direction === "column" && e.key === "ArrowUp") setRatio((r) => Math.max(min, r - step));
    if (direction === "column" && e.key === "ArrowDown") setRatio((r) => Math.min(max, r + step));
  }

  const isRow = direction === "row";

  return (
    <div ref={containerRef} className={`resizable-split ${isRow ? "split-row" : "split-column"}`}>
      <div className="split-pane" style={{ flexBasis: `${ratio}%` }}>
        {left}
      </div>
      <div
        className="split-divider"
        role="separator"
        aria-orientation={isRow ? "vertical" : "horizontal"}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onHandleKeyDown}
      >
        <div className="split-divider-grip" />
      </div>
      <div className="split-pane" style={{ flexBasis: `${100 - ratio}%` }}>
        {right}
      </div>
    </div>
  );
}
