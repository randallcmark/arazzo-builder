import { parse } from "yaml";

export type OpenApiOperation = {
  id: string;
  method: string;
  path: string;
  summary: string;
  sourceName?: string;
  sourceTitle?: string;
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
  paths?: Record<
    string,
    Record<
      string,
      {
        operationId?: string;
        summary?: string;
      }
    >
  >;
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

export function extractOperations(
  document: OpenApiDocument,
  sourceName?: string,
  sourceTitle?: string,
): OpenApiOperation[] {
  const operations: OpenApiOperation[] = [];
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!METHODS.has(method.toLowerCase()) || !operation?.operationId) continue;
      operations.push({
        id: operation.operationId,
        method: method.toUpperCase(),
        path,
        summary: operation.summary ?? operation.operationId,
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
