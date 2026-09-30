import * as yaml from "js-yaml";
import type { JsonValue } from "./jsonUtils";

export type SpecFormat = "json" | "yaml";

export type ParsedSpec = { ok: true; format: SpecFormat; doc: unknown } | { ok: false; message: string };

/**
 * Parses OpenAPI/Swagger input as either JSON or YAML — entirely client-side (js-yaml is a
 * bundled dependency, no network call of any kind, same as every other parser in this app).
 * JSON is tried first so a JSON document is labeled "json" rather than "yaml" (valid JSON also
 * happens to be valid YAML, so trying YAML first would mislabel it).
 */
export function parseSpecText(raw: string): ParsedSpec {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, message: "Nothing to parse yet." };
  try {
    const doc = JSON.parse(raw);
    return { ok: true, format: "json", doc };
  } catch {
    // fall through to YAML
  }
  try {
    const doc = yaml.load(raw);
    return { ok: true, format: "yaml", doc };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid YAML/JSON.";
    return { ok: false, message };
  }
}

export function toYamlText(doc: unknown): string {
  return yaml.dump(doc, { noRefs: true, lineWidth: 100 });
}

export function toJsonText(doc: unknown): string {
  return JSON.stringify(doc, null, 2);
}

export interface ValidationIssue {
  message: string;
  path?: string;
}

export interface ValidationResult {
  version: string | null;
  isV2: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * A pragmatic, dependency-free OpenAPI 2.0/3.x validator: it doesn't implement the full JSON
 * Schema meta-validation the spec technically requires, but it does catch the mistakes people
 * actually make — missing required root fields, paths with no operations, operations with no
 * responses, duplicate operationIds, and $ref pointers to schemas that don't exist. Runs
 * entirely in the browser on the already-parsed document.
 */
export function validateOpenApiDoc(doc: unknown): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!isPlainObject(doc)) {
    errors.push({ message: "The document must be a YAML/JSON object at the top level." });
    return { version: null, isV2: false, errors, warnings };
  }

  const swaggerField = doc.swagger;
  const openapiField = doc.openapi;
  const isV2 = typeof swaggerField === "string";
  const isV3 = typeof openapiField === "string";
  let version: string | null = null;

  if (isV2) {
    version = swaggerField as string;
    if (version !== "2.0") warnings.push({ message: `Unrecognized "swagger" version "${version}" (expected "2.0").`, path: "swagger" });
  } else if (isV3) {
    version = openapiField as string;
    if (!/^3\.\d+\.\d+/.test(version)) warnings.push({ message: `Unusual "openapi" version string "${version}".`, path: "openapi" });
  } else {
    errors.push({ message: 'Missing a top-level "openapi" (3.x) or "swagger" (2.0) version field.' });
  }

  const info = doc.info;
  if (!isPlainObject(info)) {
    errors.push({ message: 'Missing required "info" object.', path: "info" });
  } else {
    if (!info.title) errors.push({ message: 'Missing required "info.title".', path: "info.title" });
    if (!info.version) errors.push({ message: 'Missing required "info.version".', path: "info.version" });
  }

  const paths = doc.paths;
  if (!isPlainObject(paths)) {
    errors.push({ message: 'Missing required "paths" object.', path: "paths" });
  } else if (Object.keys(paths).length === 0) {
    warnings.push({ message: '"paths" is empty — no endpoints are defined.', path: "paths" });
  } else {
    const seenOperationIds = new Map<string, string>();
    for (const [p, rawItem] of Object.entries(paths)) {
      if (!p.startsWith("/")) warnings.push({ message: `Path "${p}" should start with "/".`, path: `paths.${p}` });
      if (!isPlainObject(rawItem)) {
        errors.push({ message: `Path item for "${p}" must be an object.`, path: `paths.${p}` });
        continue;
      }
      let hasOperation = false;
      for (const method of HTTP_METHODS) {
        const op = rawItem[method];
        if (!isPlainObject(op)) continue;
        hasOperation = true;
        const loc = `paths.${p}.${method}`;
        const responses = op.responses;
        if (!isPlainObject(responses) || Object.keys(responses).length === 0) {
          errors.push({ message: `${method.toUpperCase()} ${p} has no "responses" defined.`, path: loc });
        }
        const operationId = op.operationId;
        if (!operationId) {
          warnings.push({ message: `${method.toUpperCase()} ${p} has no "operationId".`, path: loc });
        } else if (typeof operationId === "string") {
          const prevPath = seenOperationIds.get(operationId);
          if (prevPath && prevPath !== loc) {
            errors.push({ message: `Duplicate operationId "${operationId}" (also used at ${prevPath}).`, path: loc });
          }
          seenOperationIds.set(operationId, loc);
        }
        if (!op.summary && !op.description) {
          warnings.push({ message: `${method.toUpperCase()} ${p} has no summary or description.`, path: loc });
        }
      }
      if (!hasOperation) warnings.push({ message: `Path "${p}" defines no HTTP operations.`, path: `paths.${p}` });
    }
  }

  const schemas = collectSchemas(doc);
  const schemaNames = new Set(Object.keys(schemas));

  function walkRefs(node: unknown, path: string) {
    if (!isPlainObject(node) && !Array.isArray(node)) return;
    if (isPlainObject(node) && typeof node.$ref === "string") {
      const ref = node.$ref;
      const m = ref.match(/^#\/(?:components\/schemas|definitions)\/([^/]+)$/);
      if (m) {
        if (!schemaNames.has(m[1])) {
          errors.push({ message: `Unresolved $ref "${ref}" — no schema named "${m[1]}".`, path });
        }
      } else if (!ref.startsWith("#/")) {
        warnings.push({ message: `External $ref "${ref}" cannot be validated offline.`, path });
      }
    }
    const entries = Array.isArray(node) ? node.entries() : Object.entries(node as Record<string, unknown>);
    for (const [k, v] of entries) {
      if (v && typeof v === "object") walkRefs(v, `${path}.${k}`);
    }
  }
  walkRefs(doc, "$");

  return { version, isV2, errors, warnings };
}

export interface EndpointInfo {
  method: string;
  path: string;
  summary?: string;
  operationId?: string;
  tags?: string[];
  operation: unknown;
}

export function collectEndpoints(doc: unknown): EndpointInfo[] {
  const result: EndpointInfo[] = [];
  if (!isPlainObject(doc) || !isPlainObject(doc.paths)) return result;
  for (const [p, rawItem] of Object.entries(doc.paths)) {
    if (!isPlainObject(rawItem)) continue;
    for (const method of HTTP_METHODS) {
      const op = rawItem[method];
      if (!isPlainObject(op)) continue;
      result.push({
        method: method.toUpperCase(),
        path: p,
        summary: (op.summary as string) || (op.description as string) || undefined,
        operationId: op.operationId as string | undefined,
        tags: Array.isArray(op.tags) ? (op.tags as string[]) : undefined,
        operation: op,
      });
    }
  }
  return result;
}

export function collectSchemas(doc: unknown): Record<string, JsonValue> {
  if (!isPlainObject(doc)) return {};
  const components = doc.components;
  if (isPlainObject(components) && isPlainObject(components.schemas)) {
    return components.schemas as Record<string, JsonValue>;
  }
  if (isPlainObject(doc.definitions)) return doc.definitions as Record<string, JsonValue>;
  return {};
}

export function detectVersionLabel(doc: unknown): string {
  if (isPlainObject(doc)) {
    if (typeof doc.openapi === "string") return `OpenAPI ${doc.openapi}`;
    if (typeof doc.swagger === "string") return `Swagger ${doc.swagger}`;
  }
  return "Unknown version";
}
