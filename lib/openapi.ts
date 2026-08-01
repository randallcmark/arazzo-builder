import { parse } from "yaml";

export type OpenApiOperation = {
  id: string;
  method: string;
  path: string;
  summary: string;
  resolved: boolean;
  sourceName?: string;
  sourceTitle?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  parameters?: OpenApiParameterDetail[];
  requestBody?: OpenApiRequestBodyDetail;
  responses?: OpenApiResponseDetail[];
  security?: string[];
  servers?: string[];
};

export type OpenApiParameterDetail = {
  name: string;
  location: string;
  required: boolean;
  description?: string;
  schema?: string;
};

export type OpenApiRequestBodyDetail = {
  required: boolean;
  description?: string;
  contentTypes: string[];
};

export type OpenApiResponseDetail = {
  status: string;
  description?: string;
  contentTypes: string[];
};

export type ApiCatalogue = {
  sourceName: string;
  title: string;
  location: string;
  operations: OpenApiOperation[];
};

export type OpenApiDocument = {
  openapi?: string;
  swagger?: string;
  info?: {
    title?: string;
  };
  servers?: Array<{ url?: string }>;
  schemes?: string[];
  host?: string;
  basePath?: string;
  security?: Array<Record<string, unknown>>;
  paths?: Record<string, OpenApiPathItem>;
};

type OpenApiPathItem = Record<string, unknown> & {
  parameters?: unknown[];
};

type OpenApiOperationObject = {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: unknown[];
  deprecated?: boolean;
  parameters?: unknown[];
  requestBody?: unknown;
  responses?: unknown;
  security?: Array<Record<string, unknown>>;
  servers?: Array<{ url?: string }>;
};

const METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
]);

export const OPERATION_RESULT_LIMIT = 180;

export function extractOperations(
  document: OpenApiDocument,
  sourceName?: string,
  sourceTitle?: string,
): OpenApiOperation[] {
  const operations: OpenApiOperation[] = [];
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, candidate] of Object.entries(pathItem)) {
      if (!METHODS.has(method.toLowerCase()) || !isRecord(candidate)) continue;
      const operation = candidate as OpenApiOperationObject;
      if (!operation.operationId) continue;
      const parameters = normalizeParameters([
        ...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
        ...(Array.isArray(operation.parameters) ? operation.parameters : []),
      ]);
      const requestBody = normalizeRequestBody(operation.requestBody);
      const responses = normalizeResponses(operation.responses);
      const security = normalizeSecurity(operation.security ?? document.security);
      const servers = normalizeServers(operation.servers, document);
      operations.push({
        id: operation.operationId,
        method: method.toUpperCase(),
        path,
        summary: operation.summary ?? operation.operationId,
        resolved: true,
        ...(cleanText(operation.description)
          ? { description: cleanText(operation.description) }
          : {}),
        ...(normalizeStringArray(operation.tags).length
          ? { tags: normalizeStringArray(operation.tags) }
          : {}),
        ...(operation.deprecated ? { deprecated: true } : {}),
        ...(parameters.length ? { parameters } : {}),
        ...(requestBody ? { requestBody } : {}),
        ...(responses.length ? { responses } : {}),
        ...(security.length ? { security } : {}),
        ...(servers.length ? { servers } : {}),
        ...(sourceName ? { sourceName } : {}),
        ...(sourceTitle ? { sourceTitle } : {}),
      });
    }
  }
  return operations.sort((a, b) => a.summary.localeCompare(b.summary));
}

export function parseOpenApiSource(source: string): OpenApiDocument {
  const document = parse(source) as unknown;
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("The OpenAPI source must contain an object.");
  }

  const candidate = document as OpenApiDocument;
  if (!candidate.openapi && !candidate.swagger) {
    throw new Error("The file does not declare an OpenAPI or Swagger version.");
  }
  if (!candidate.paths || typeof candidate.paths !== "object") {
    throw new Error("The OpenAPI document does not contain a paths object.");
  }
  return candidate;
}

export function buildCatalogue(
  document: OpenApiDocument,
  sourceName: string,
  location: string,
): ApiCatalogue {
  const title = document.info?.title?.trim() || sourceName;
  return {
    sourceName,
    title,
    location,
    operations: extractOperations(document, sourceName, title),
  };
}

export function operationReferenceParts(reference?: string): {
  sourceName: string;
  operationId: string;
} | null {
  if (!reference) return null;
  const match = reference.match(/^\$sourceDescriptions\.([^.]+)\.(.+)$/);
  if (!match) return null;
  return { sourceName: match[1], operationId: match[2] };
}

export function canAutoLoadOpenApiReference(
  reference: string,
  pageUrl: string,
): boolean {
  try {
    const page = new URL(pageUrl);
    const target = new URL(reference, page);
    return (
      (target.protocol === "http:" || target.protocol === "https:") &&
      target.origin === page.origin
    );
  } catch {
    return false;
  }
}

export function operationMatches(
  operation: OpenApiOperation,
  query: string,
): boolean {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return true;
  return [operation.id, operation.method, operation.path, operation.summary].some(
    (value) => value.toLowerCase().includes(cleanQuery),
  );
}

export function resolveCatalogueOperation(
  reference: string | undefined,
  catalogues: ApiCatalogue[],
): { catalogue: ApiCatalogue; operation: OpenApiOperation } | null {
  const parts = operationReferenceParts(reference);
  if (!parts) return null;
  const catalogue = catalogues.find(
    (candidate) => candidate.sourceName === parts.sourceName,
  );
  const operation = catalogue?.operations.find(
    (candidate) => candidate.id === parts.operationId,
  );
  return catalogue && operation ? { catalogue, operation } : null;
}

export function resolveStepOperation(
  operationId: string | undefined,
  operationPath: string | undefined,
  catalogues: ApiCatalogue[],
): { catalogue: ApiCatalogue; operation: OpenApiOperation } | null {
  const byId = resolveCatalogueOperation(operationId, catalogues);
  if (byId) return byId;
  if (operationId && !operationReferenceParts(operationId)) {
    const matches = catalogues.flatMap((catalogue) =>
      catalogue.operations
        .filter((operation) => operation.id === operationId)
        .map((operation) => ({ catalogue, operation })),
    );
    if (matches.length === 1) return matches[0];
  }
  if (!operationPath) return null;
  const reference = operationPathReferenceParts(operationPath);
  const candidates = reference.sourceName
    ? catalogues.filter(
        (catalogue) => catalogue.sourceName === reference.sourceName,
      )
    : catalogues;
  const matches = candidates.flatMap((catalogue) =>
    catalogue.operations
      .filter(
        (operation) =>
          operation.path === reference.path &&
          (!reference.method ||
            operation.method.toLowerCase() === reference.method),
      )
      .map((operation) => ({ catalogue, operation })),
  );
  return matches.length === 1 ? matches[0] : null;
}

function operationPathReferenceParts(reference: string): {
  sourceName?: string;
  path?: string;
  method?: string;
} {
  const sourceName = reference.match(
    /\{?\$sourceDescriptions\.([A-Za-z0-9_-]+)(?:\.url)?\}?/,
  )?.[1];
  const pointer = reference.split("#", 2)[1];
  if (!pointer) return { sourceName };
  const segments = pointer
    .replace(/^\//, "")
    .split("/")
    .map(decodePointerSegment);
  const pathsIndex = segments.indexOf("paths");
  if (pathsIndex < 0 || !segments[pathsIndex + 1]) return { sourceName };
  const method = segments[pathsIndex + 2]?.toLowerCase();
  return {
    sourceName,
    path: segments[pathsIndex + 1],
    ...(method && METHODS.has(method) ? { method } : {}),
  };
}

function decodePointerSegment(segment: string): string {
  try {
    return decodeURIComponent(segment).replace(/~1/g, "/").replace(/~0/g, "~");
  } catch {
    return segment.replace(/~1/g, "/").replace(/~0/g, "~");
  }
}

function normalizeParameters(values: unknown[]): OpenApiParameterDetail[] {
  const parameters = new Map<string, OpenApiParameterDetail>();
  for (const value of values) {
    if (!isRecord(value)) continue;
    const name = cleanText(value.name);
    const location = cleanText(value.in);
    if (!name || !location) continue;
    parameters.set(`${location}:${name}`, {
      name,
      location,
      required: value.required === true || location === "path",
      ...(cleanText(value.description)
        ? { description: cleanText(value.description) }
        : {}),
      ...(schemaSummary(value.schema ?? value)
        ? { schema: schemaSummary(value.schema ?? value) }
        : {}),
    });
  }
  return Array.from(parameters.values()).slice(0, 30);
}

function normalizeRequestBody(value: unknown): OpenApiRequestBodyDetail | null {
  if (!isRecord(value)) return null;
  const contentTypes = isRecord(value.content)
    ? Object.keys(value.content).slice(0, 12)
    : [];
  return {
    required: value.required === true,
    ...(cleanText(value.description)
      ? { description: cleanText(value.description) }
      : {}),
    contentTypes,
  };
}

function normalizeResponses(value: unknown): OpenApiResponseDetail[] {
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .flatMap(([status, response]) => {
      if (!isRecord(response)) return [];
      return [
        {
          status,
          ...(cleanText(response.description)
            ? { description: cleanText(response.description) }
            : {}),
          contentTypes: isRecord(response.content)
            ? Object.keys(response.content).slice(0, 12)
            : [],
        },
      ];
    })
    .slice(0, 24);
}

function normalizeSecurity(
  value: Array<Record<string, unknown>> | undefined,
): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.flatMap((requirement) => Object.keys(requirement))),
  ).slice(0, 12);
}

function normalizeServers(
  operationServers: Array<{ url?: string }> | undefined,
  document: OpenApiDocument,
): string[] {
  const declared = operationServers?.length
    ? operationServers
    : document.servers;
  const urls = (declared ?? [])
    .map((server) => cleanText(server?.url))
    .filter((value): value is string => Boolean(value));
  if (urls.length) return urls.slice(0, 8);
  if (!document.host) return [];
  const scheme = document.schemes?.[0] ?? "https";
  return [`${scheme}://${document.host}${document.basePath ?? ""}`];
}

function schemaSummary(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.$ref === "string") {
    return value.$ref.split("/").at(-1) ?? value.$ref;
  }
  const type = cleanText(value.type);
  const format = cleanText(value.format);
  if (type === "array") {
    return `array<${schemaSummary(value.items) ?? "value"}>`;
  }
  if (type) return format ? `${type} · ${format}` : type;
  if (Array.isArray(value.oneOf)) return `oneOf ${value.oneOf.length} schemas`;
  if (Array.isArray(value.anyOf)) return `anyOf ${value.anyOf.length} schemas`;
  if (Array.isArray(value.allOf)) return `allOf ${value.allOf.length} schemas`;
  return undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 12);
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim().replace(/\s+/g, " ");
  return clean ? clean.slice(0, 800) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
