import type { MouseEvent } from "react";
import { isContainer, formatPath, type JsonValue } from "./jsonUtils";

export function PrimitiveValue({
  value,
}: {
  value: string | number | boolean | null;
}) {
  if (value === null) return <span className="tok-null">null</span>;
  if (typeof value === "string")
    return <span className="tok-string">{JSON.stringify(value)}</span>;
  if (typeof value === "boolean")
    return <span className="tok-bool">{String(value)}</span>;
  return <span className="tok-number">{value}</span>;
}

interface RowProps {
  keyLabel?: string;
  value: JsonValue;
  path: string;
  depth: number;
  isLast: boolean;
  collapsedPaths: Set<string>;
  onToggle: (path: string) => void;
  showFullPath: boolean;
  activePath?: string | null;
  onSelectPath?: (path: string) => void;
}

function Row({
  keyLabel,
  value,
  path,
  depth,
  isLast,
  collapsedPaths,
  onToggle,
  showFullPath,
  activePath,
  onSelectPath,
}: RowProps) {
  const indent = { paddingLeft: depth * 18 + 8 };
  const isActive = activePath === path;

  function handleRowClick(e: MouseEvent) {
    // Let the collapse toggle handle its own click without also firing row selection.
    if ((e.target as HTMLElement).closest(".row-toggle")) return;
    onSelectPath?.(path);
  }

  if (!isContainer(value)) {
    return (
      <div
        className={`tree-row ${isActive ? "tree-row-active" : ""}`}
        style={indent}
        onClick={handleRowClick}
      >
        <span className="row-spacer" />
        {keyLabel !== undefined && (
          <>
            <span className="tok-key">"{keyLabel}"</span>
            <span className="punct">: </span>
          </>
        )}
        <PrimitiveValue value={value} />
        {!isLast && <span className="punct">,</span>}
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries: [string, JsonValue][] = isArray
    ? (value as JsonValue[]).map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, JsonValue>);
  const openBr = isArray ? "[" : "{";
  const closeBr = isArray ? "]" : "}";
  const count = entries.length;

  if (count === 0) {
    return (
      <div
        className={`tree-row ${isActive ? "tree-row-active" : ""}`}
        style={indent}
        onClick={handleRowClick}
      >
        <span className="row-spacer" />
        {keyLabel !== undefined && (
          <>
            <span className="tok-key">"{keyLabel}"</span>
            <span className="punct">: </span>
          </>
        )}
        <span className="punct">
          {openBr}
          {closeBr}
        </span>
        {!isLast && <span className="punct">,</span>}
      </div>
    );
  }

  const collapsed = collapsedPaths.has(path);
  const noun = isArray ? (count === 1 ? "item" : "items") : count === 1 ? "key" : "keys";

  return (
    <>
      <div
        className={`tree-row ${isActive ? "tree-row-active" : ""}`}
        style={indent}
        onClick={handleRowClick}
      >
        <button
          type="button"
          className="row-toggle"
          onClick={() => onToggle(path)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "▸" : "▾"}
        </button>
        {keyLabel !== undefined && (
          <>
            <span className="tok-key">"{keyLabel}"</span>
            <span className="punct">: </span>
          </>
        )}
        <span className="punct">{openBr}</span>
        {collapsed && (
          <>
            {showFullPath && (
              <span className="row-path">{formatPath(path)}</span>
            )}
            <span className="row-count">
              {count} {noun}
            </span>
            <span className="punct">{closeBr}</span>
            {!isLast && <span className="punct">,</span>}
          </>
        )}
      </div>
      {!collapsed && (
        <>
          {entries.map(([k, v], i) => (
            <Row
              key={k}
              keyLabel={isArray ? undefined : k}
              value={v}
              path={isArray ? `${path}[${k}]` : `${path}.${k}`}
              depth={depth + 1}
              isLast={i === entries.length - 1}
              collapsedPaths={collapsedPaths}
              onToggle={onToggle}
              showFullPath={showFullPath}
              activePath={activePath}
              onSelectPath={onSelectPath}
            />
          ))}
          <div className="tree-row" style={indent}>
            <span className="row-spacer" />
            <span className="punct">{closeBr}</span>
            {!isLast && <span className="punct">,</span>}
          </div>
        </>
      )}
    </>
  );
}

export default function JsonTree({
  data,
  collapsedPaths,
  onToggle,
  showFullPath = false,
  activePath = null,
  onSelectPath,
}: {
  data: JsonValue;
  collapsedPaths: Set<string>;
  onToggle: (path: string) => void;
  showFullPath?: boolean;
  activePath?: string | null;
  onSelectPath?: (path: string) => void;
}) {
  return (
    <div className="json-tree">
      <Row
        value={data}
        path="root"
        depth={0}
        isLast
        collapsedPaths={collapsedPaths}
        onToggle={onToggle}
        showFullPath={showFullPath}
        activePath={activePath}
        onSelectPath={onSelectPath}
      />
    </div>
  );
}
