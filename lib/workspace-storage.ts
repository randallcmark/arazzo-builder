import type { ApiCatalogue } from "./openapi";

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
  fallbackName = "deel-arazzo.yml",
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
        catalogues: Array.isArray(candidate.catalogues)
          ? candidate.catalogues
          : undefined,
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
