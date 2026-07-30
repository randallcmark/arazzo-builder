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
    },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
