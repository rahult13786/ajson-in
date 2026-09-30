import { useMemo, useRef, useState, type ChangeEvent } from "react";
import ResizableSplit from "./ResizableSplit";
import GraphView from "./GraphView";
import { DownloadIcon } from "./icons";
import { byteSize, formatBytes, type JsonValue } from "./jsonUtils";
import {
  parseSpecText,
  toYamlText,
  toJsonText,
  validateOpenApiDoc,
  collectEndpoints,
  collectSchemas,
  detectVersionLabel,
  type EndpointInfo,
} from "./swaggerUtils";

const SAMPLE = `openapi: 3.0.3
info:
  title: Sample Store API
  version: 1.0.0
  description: A tiny example API for trying out the Swagger page.
paths:
  /orders:
    get:
      summary: List orders
      operationId: listOrders
      tags: [Orders]
      responses:
        '200':
          description: A list of orders
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Order'
    post:
      summary: Create an order
      operationId: createOrder
      tags: [Orders]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Order'
      responses:
        '201':
          description: Order created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'
  /orders/{orderId}:
    get:
      summary: Get an order by id
      operationId: getOrder
      tags: [Orders]
      parameters:
        - name: orderId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: The order
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'
        '404':
          description: Order not found
components:
  schemas:
    Order:
      type: object
      properties:
        id:
          type: string
        status:
          type: string
        customer:
          $ref: '#/components/schemas/Customer'
        amount:
          type: number
    Customer:
      type: object
      properties:
        id:
          type: string
        email:
          type: string
`;

type Tab = "validation" | "endpoints" | "schemas" | "graph";

const METHOD_ORDER = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD", "TRACE"];

function methodClass(method: string): string {
  return `method-badge method-${method.toLowerCase()}`;
}

export default function SwaggerPage() {
  const [raw, setRaw] = useState("");
  const [tab, setTab] = useState<Tab>("validation");
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointInfo | null>(null);
  const [selectedSchema, setSelectedSchema] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => (raw.trim() === "" ? null : parseSpecText(raw)), [raw]);

  const validation = useMemo(() => (parsed?.ok ? validateOpenApiDoc(parsed.doc) : null), [parsed]);
  const endpoints = useMemo(() => (parsed?.ok ? collectEndpoints(parsed.doc) : []), [parsed]);
  const schemas = useMemo(() => (parsed?.ok ? collectSchemas(parsed.doc) : {}), [parsed]);
  const schemaNames = useMemo(() => Object.keys(schemas), [schemas]);

  const stats = useMemo(() => {
    const lines = raw === "" ? 0 : raw.split("\n").length;
    return { lines, bytes: byteSize(raw) };
  }, [raw]);

  const status: "empty" | "valid" | "invalid" = !parsed ? "empty" : parsed.ok ? "valid" : "invalid";

  function handleLoadSample() {
    setRaw(SAMPLE);
    setSelectedEndpoint(null);
    setSelectedSchema(null);
    setTab("validation");
  }

  function handleClear() {
    setRaw("");
    setSelectedEndpoint(null);
    setSelectedSchema(null);
  }

  function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setRaw(String(reader.result ?? ""));
      setSelectedEndpoint(null);
      setSelectedSchema(null);
      setTab("validation");
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function download(text: string, filename: string, mime: string) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadYaml() {
    if (!parsed?.ok) return;
    download(toYamlText(parsed.doc), "openapi-spec.yaml", "text/yaml");
  }

  function handleDownloadJson() {
    if (!parsed?.ok) return;
    download(toJsonText(parsed.doc), "openapi-spec.json", "application/json");
  }

  const sortedEndpoints = useMemo(
    () => [...endpoints].sort((a, b) => a.path.localeCompare(b.path) || METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method)),
    [endpoints]
  );

  const leftPanel = (
    <section className="pane pane-left">
      <div className="pane-header">
        <h2>OpenAPI / Swagger spec</h2>
        <div className="toolbar">
          <button className="btn" onClick={handleLoadSample}>
            Load sample
          </button>
          <button className="btn" onClick={() => fileInputRef.current?.click()}>
            Upload file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".yaml,.yml,.json,text/yaml,application/json"
            onChange={handleFileUpload}
            hidden
          />
          <button className="btn btn-ghost" onClick={handleClear} disabled={!raw}>
            Clear
          </button>
        </div>
      </div>
      <textarea
        className="input-area"
        spellCheck={false}
        placeholder="Paste an OpenAPI 3.x or Swagger 2.0 document, as YAML or JSON…"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
      <div className="pane-footer">
        <span>{stats.lines} lines</span>
        <span>{formatBytes(stats.bytes)}</span>
        {parsed?.ok && <span className="kind-pill">{parsed.format}</span>}
        {parsed?.ok && <span className="kind-pill">{detectVersionLabel(parsed.doc)}</span>}
      </div>
    </section>
  );

  const rightPanel = (
    <section className="pane pane-right">
      <div className="pane-header">
        <h2>Specification</h2>
        <div className="toolbar">
          <button className="btn icon-btn" onClick={handleDownloadYaml} disabled={status !== "valid"} title="Download as YAML">
            <DownloadIcon />
            YAML
          </button>
          <button className="btn icon-btn" onClick={handleDownloadJson} disabled={status !== "valid"} title="Download as JSON">
            <DownloadIcon />
            JSON
          </button>
        </div>
      </div>

      <div className="swagger-tabs">
        <button className={`swagger-tab ${tab === "validation" ? "active" : ""}`} onClick={() => setTab("validation")} disabled={status !== "valid"}>
          Validation
          {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
            <span className="swagger-tab-count">{validation.errors.length + validation.warnings.length}</span>
          )}
        </button>
        <button className={`swagger-tab ${tab === "endpoints" ? "active" : ""}`} onClick={() => setTab("endpoints")} disabled={status !== "valid"}>
          Endpoints
          {endpoints.length > 0 && <span className="swagger-tab-count">{endpoints.length}</span>}
        </button>
        <button className={`swagger-tab ${tab === "schemas" ? "active" : ""}`} onClick={() => setTab("schemas")} disabled={status !== "valid"}>
          Schemas
          {schemaNames.length > 0 && <span className="swagger-tab-count">{schemaNames.length}</span>}
        </button>
        <button className={`swagger-tab ${tab === "graph" ? "active" : ""}`} onClick={() => setTab("graph")} disabled={status !== "valid"}>
          Graph
        </button>
      </div>

      <div className={`output-area ${tab === "graph" ? "output-area-graph" : ""}`}>
        {status === "empty" && (
          <div className="empty-state">
            <span className="empty-glyph">λ</span>
            <p>Paste or load an OpenAPI/Swagger document to validate it and browse its endpoints and schemas.</p>
          </div>
        )}
        {status === "invalid" && parsed && !parsed.ok && (
          <div className="error-banner">
            <span className="error-label">Parse error</span>
            <span>{parsed.message}</span>
          </div>
        )}

        {status === "valid" && validation && tab === "validation" && (
          <div className="validation-panel">
            <div className="swagger-summary-bar">
              <span className={`validation-summary-badge ${validation.errors.length > 0 ? "has-errors" : "is-clean"}`}>
                {validation.errors.length} error{validation.errors.length === 1 ? "" : "s"}
              </span>
              <span className={`validation-summary-badge ${validation.warnings.length > 0 ? "has-warnings" : "is-clean"}`}>
                {validation.warnings.length} warning{validation.warnings.length === 1 ? "" : "s"}
              </span>
              {validation.errors.length === 0 && validation.warnings.length === 0 && (
                <span className="hint-text">This document looks structurally sound.</span>
              )}
            </div>
            {validation.errors.length > 0 && (
              <ul className="validation-list">
                {validation.errors.map((issue, i) => (
                  <li key={`err-${i}`} className="validation-item error">
                    <span className="validation-item-icon">✕</span>
                    <span>
                      {issue.message}
                      {issue.path && <span className="validation-item-path"> — {issue.path}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {validation.warnings.length > 0 && (
              <ul className="validation-list">
                {validation.warnings.map((issue, i) => (
                  <li key={`warn-${i}`} className="validation-item warning">
                    <span className="validation-item-icon">!</span>
                    <span>
                      {issue.message}
                      {issue.path && <span className="validation-item-path"> — {issue.path}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {status === "valid" && tab === "endpoints" && (
          <div className="swagger-columns">
            <ul className="endpoint-list">
              {sortedEndpoints.length === 0 && <p className="search-empty">No endpoints defined in "paths".</p>}
              {sortedEndpoints.map((ep, i) => (
                <li key={`${ep.method}-${ep.path}-${i}`}>
                  <button
                    type="button"
                    className={`endpoint-item ${selectedEndpoint === ep ? "active" : ""}`}
                    onClick={() => setSelectedEndpoint(ep)}
                  >
                    <span className={methodClass(ep.method)}>{ep.method}</span>
                    <span className="endpoint-path">{ep.path}</span>
                    {ep.summary && <span className="endpoint-summary">{ep.summary}</span>}
                  </button>
                </li>
              ))}
            </ul>
            <div className="swagger-detail">
              {!selectedEndpoint && <p className="search-empty">Select an endpoint to see its full definition.</p>}
              {selectedEndpoint && (
                <>
                  <div className="swagger-detail-header">
                    <span className={methodClass(selectedEndpoint.method)}>{selectedEndpoint.method}</span>
                    <span className="endpoint-path">{selectedEndpoint.path}</span>
                  </div>
                  <pre className="output-text-block">{toJsonText(selectedEndpoint.operation)}</pre>
                </>
              )}
            </div>
          </div>
        )}

        {status === "valid" && tab === "schemas" && (
          <div className="swagger-columns">
            <ul className="schema-list">
              {schemaNames.length === 0 && <p className="search-empty">No schemas found under components.schemas / definitions.</p>}
              {schemaNames.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    className={`schema-item ${selectedSchema === name ? "active" : ""}`}
                    onClick={() => setSelectedSchema(name)}
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
            <div className="swagger-detail">
              {!selectedSchema && <p className="search-empty">Select a schema to see its full definition.</p>}
              {selectedSchema && <pre className="output-text-block">{toJsonText(schemas[selectedSchema])}</pre>}
            </div>
          </div>
        )}

        {status === "valid" && tab === "graph" && (
          <>
            {schemaNames.length === 0 ? (
              <div className="empty-state">
                <span className="empty-glyph">λ</span>
                <p>No schemas to graph — add some under components.schemas (3.x) or definitions (2.0).</p>
              </div>
            ) : (
              // Reuses the same canvas-drawn, fully offline Export PNG used on the Formatter
              // page's Graph view — schemas is plain JSON-shaped data, so it renders as entity
              // boxes exactly like any other nested payload, with $ref pointers shown as fields.
              <GraphView data={schemas as unknown as JsonValue} rootLabel="schemas" />
            )}
          </>
        )}
      </div>
    </section>
  );

  return (
    <>
      <div className="page-statusbar">
        <div className={`status-pill status-${status}`}>
          <span className="status-dot" />
          {status === "empty" && "Waiting for input"}
          {status === "valid" && `Valid ${detectVersionLabel(parsed && parsed.ok ? parsed.doc : null)}`}
          {status === "invalid" && "Invalid document"}
        </div>
      </div>
      <ResizableSplit storageKey="swagger" left={leftPanel} right={rightPanel} />
    </>
  );
}
