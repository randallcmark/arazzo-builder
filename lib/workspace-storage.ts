import type { ApiCatalogue, OpenApiOperation } from "./openapi";
import { siteConfig } from "../config/site";

export type StoredWorkspace = {
  source: string;
  baseline: string;
  name: string;
  catalogues?: ApiCatalogue[];
};

export function encodeStoredWorkspace(workspace: StoredWorkspace): string {
  return JSON.stringify(workspace);
}

export function decodeStoredWorkspace(
  value: string,
  fallbackName = siteConfig.defaultDocumentName,
): StoredWorkspace {
  try {
    const candidate = JSON.parse(value) as Partial<StoredWorkspace>;
    if (typeof candidate.source === "string") {
      return {
        source: candidate.source,
        baseline:
          typeof candidate.baseline === "string"
            ? candidate.baseline
            : candidate.source,
        name:
          typeof candidate.name === "string" && candidate.name.trim()
            ? candidate.name
            : fallbackName,
        catalogues: decodeCatalogues(candidate.catalogues),
      };
    }
  } catch {
    // Drafts created before workspace metadata was added were stored as raw YAML.
  }

  return {
    source: value,
    baseline: value,
    name: fallbackName,
    catalogues: undefined,
  };
}

function decodeCatalogues(value: unknown): ApiCatalogue[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const catalogues = value.flatMap((candidate) => {
    if (
      !isRecord(candidate) ||
      typeof candidate.sourceName !== "string" ||
      typeof candidate.title !== "string" ||
      typeof candidate.location !== "string" ||
      !Array.isArray(candidate.operations)
    ) {
      return [];
    }
    const operations = candidate.operations.flatMap((operation) =>
      decodeOperation(operation),
    );
    return [
      {
        sourceName: candidate.sourceName,
        title: candidate.title,
        location: candidate.location,
        operations,
      },
    ];
  });
  return catalogues.length ? catalogues : undefined;
}

function decodeOperation(value: unknown): OpenApiOperation[] {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.method !== "string" ||
    typeof value.path !== "string" ||
    typeof value.summary !== "string"
  ) {
    return [];
  }
  return [
    {
      id: value.id,
      method: value.method === "OP" ? "REF" : value.method,
      path: value.path,
      summary: value.summary,
      resolved:
        typeof value.resolved === "boolean"
          ? value.resolved
          : value.method !== "OP",
      ...(typeof value.sourceName === "string"
        ? { sourceName: value.sourceName }
        : {}),
      ...(typeof value.sourceTitle === "string"
        ? { sourceTitle: value.sourceTitle }
        : {}),
      ...(typeof value.description === "string"
        ? { description: value.description }
        : {}),
      ...(stringArray(value.tags).length ? { tags: stringArray(value.tags) } : {}),
      ...(value.deprecated === true ? { deprecated: true } : {}),
      ...(decodeParameters(value.parameters).length
        ? { parameters: decodeParameters(value.parameters) }
        : {}),
      ...(decodeRequestBody(value.requestBody)
        ? { requestBody: decodeRequestBody(value.requestBody)! }
        : {}),
      ...(decodeResponses(value.responses).length
        ? { responses: decodeResponses(value.responses) }
        : {}),
      ...(stringArray(value.security).length
        ? { security: stringArray(value.security) }
        : {}),
      ...(stringArray(value.servers).length
        ? { servers: stringArray(value.servers) }
        : {}),
    },
  ];
}

function decodeParameters(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((parameter) => {
    if (
      !isRecord(parameter) ||
      typeof parameter.name !== "string" ||
      typeof parameter.location !== "string" ||
      typeof parameter.required !== "boolean"
    ) {
      return [];
    }
    return [
      {
        name: parameter.name,
        location: parameter.location,
        required: parameter.required,
        ...(typeof parameter.description === "string"
          ? { description: parameter.description }
          : {}),
        ...(typeof parameter.schema === "string"
          ? { schema: parameter.schema }
          : {}),
      },
    ];
  });
}

function decodeRequestBody(value: unknown) {
  if (!isRecord(value) || typeof value.required !== "boolean") return null;
  return {
    required: value.required,
    ...(typeof value.description === "string"
      ? { description: value.description }
      : {}),
    contentTypes: stringArray(value.contentTypes),
  };
}

function decodeResponses(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((response) => {
    if (!isRecord(response) || typeof response.status !== "string") return [];
    return [
      {
        status: response.status,
        ...(typeof response.description === "string"
          ? { description: response.description }
          : {}),
        contentTypes: stringArray(response.contentTypes),
      },
    ];
  });
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
