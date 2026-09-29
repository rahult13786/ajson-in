import type { CompareRow } from "./compareUtils";

export default function CompareTree({
  rows,
  activeRowId,
}: {
  rows: CompareRow[];
  activeRowId: number | null;
}) {
  return (
    <div className="cmp-tree">
      {rows.map((row) => {
        const rowClass = [
          "cmp-row",
          row.kind === "left-only" ? "cmp-left-only" : "",
          row.kind === "right-only" ? "cmp-right-only" : "",
          row.kind === "changed" ? "cmp-changed" : "",
          row.id === activeRowId ? "cmp-diff-active" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const indent = { paddingLeft: row.depth * 18 + 8 };
        return (
          <div key={row.id} id={`cmp-row-${row.id}`} className={rowClass}>
            <div className="cmp-cell" style={indent}>
              {row.left !== null ? row.left : <span className="cmp-blank">—</span>}
            </div>
            <div className="cmp-cell" style={indent}>
              {row.right !== null ? row.right : <span className="cmp-blank">—</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
