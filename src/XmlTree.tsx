import type { MouseEvent } from "react";
import type { PosNode } from "./jsonPositions";
import { formatXmlPath } from "./jsonUtils";

/** Splits an XML PosNode's children into attributes (`@name`), text (`#text`), and element children. */
function splitChildren(node: PosNode) {
  const attrs: PosNode[] = [];
  let textNode: PosNode | undefined;
  const elements: PosNode[] = [];
  for (const c of node.children ?? []) {
    if (c.keyName?.startsWith("@")) attrs.push(c);
    else if (c.keyName === "#text") textNode = c;
    else elements.push(c);
  }
  return { attrs, textNode, elements };
}

interface ElementRowProps {
  node: PosNode;
  tagName: string;
  /** The document's real root tag name (constant across the whole recursion) — used only to
   *  render a correct full path for collapsed nodes, since node paths start with the synthetic
   *  "root" placeholder rather than this actual tag. */
  documentRootTag: string;
  depth: number;
  isLast: boolean;
  collapsedPaths: Set<string>;
  onToggle: (path: string) => void;
  showFullPath: boolean;
  activePath?: string | null;
  onSelectPath?: (path: string) => void;
}

function ElementRow({
  node,
  tagName,
  documentRootTag,
  depth,
  isLast,
  collapsedPaths,
  onToggle,
  showFullPath,
  activePath,
  onSelectPath,
}: ElementRowProps) {
  const indent = { paddingLeft: depth * 18 + 8 };
  const isActive = activePath === node.path;
  const { attrs, textNode, elements } = splitChildren(node);
  const attrStr = attrs.map((a) => `${a.keyName!.slice(1)}="${String(a.value)}"`).join(" ");
  const openTag = attrStr ? `<${tagName} ${attrStr}>` : `<${tagName}>`;
  const selfClosingTag = attrStr ? `<${tagName} ${attrStr}/>` : `<${tagName}/>`;
  const closeTag = `</${tagName}>`;

  function handleRowClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest(".row-toggle")) return;
    onSelectPath?.(node.path);
  }

  const hasElementChildren = elements.length > 0;

  // Leaf with no text and no children: self-closing tag, one line.
  if (!hasElementChildren && !textNode) {
    return (
      <div className={`tree-row ${isActive ? "tree-row-active" : ""}`} style={indent} onClick={handleRowClick}>
        <span className="row-spacer" />
        <span className="tok-key">{selfClosingTag}</span>
        {!isLast && <span className="punct">,</span>}
      </div>
    );
  }

  // Leaf with only text content: inline on one line.
  if (!hasElementChildren && textNode) {
    return (
      <div className={`tree-row ${isActive ? "tree-row-active" : ""}`} style={indent} onClick={handleRowClick}>
        <span className="row-spacer" />
        <span className="tok-key">{openTag}</span>
        <span className="tok-string">{String(textNode.value)}</span>
        <span className="tok-key">{closeTag}</span>
      </div>
    );
  }

  // Has element children: expandable/collapsible.
  const collapsed = collapsedPaths.has(node.path);
  const noun = elements.length === 1 ? "child" : "children";

  return (
    <>
      <div className={`tree-row ${isActive ? "tree-row-active" : ""}`} style={indent} onClick={handleRowClick}>
        <button
          type="button"
          className="row-toggle"
          onClick={() => onToggle(node.path)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "▸" : "▾"}
        </button>
        <span className="tok-key">{openTag}</span>
        {collapsed && (
          <>
            {showFullPath && <span className="row-path">{formatXmlPath(node.path, documentRootTag)}</span>}
            <span className="row-count">
              {elements.length} {noun}
            </span>
            <span className="tok-key">{closeTag}</span>
          </>
        )}
      </div>
      {!collapsed && (
        <>
          {textNode && (
            <div className="tree-row" style={{ paddingLeft: (depth + 1) * 18 + 8 }}>
              <span className="row-spacer" />
              <span className="tok-string">{String(textNode.value)}</span>
            </div>
          )}
          {elements.map((child, i) => (
            <ElementRow
              key={`${child.path}-${i}`}
              node={child}
              tagName={child.keyName ?? "node"}
              documentRootTag={documentRootTag}
              depth={depth + 1}
              isLast={i === elements.length - 1}
              collapsedPaths={collapsedPaths}
              onToggle={onToggle}
              showFullPath={showFullPath}
              activePath={activePath}
              onSelectPath={onSelectPath}
            />
          ))}
          <div className="tree-row" style={indent}>
            <span className="row-spacer" />
            <span className="tok-key">{closeTag}</span>
          </div>
        </>
      )}
    </>
  );
}

export default function XmlTree({
  root,
  rootTag,
  collapsedPaths,
  onToggle,
  showFullPath = false,
  activePath = null,
  onSelectPath,
}: {
  root: PosNode;
  rootTag: string;
  collapsedPaths: Set<string>;
  onToggle: (path: string) => void;
  showFullPath?: boolean;
  activePath?: string | null;
  onSelectPath?: (path: string) => void;
}) {
  return (
    <div className="json-tree">
      <ElementRow
        node={root}
        tagName={rootTag}
        documentRootTag={rootTag}
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
