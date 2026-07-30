import type { ArazzoSpec } from "./arazzo";
import {
  buildCatalogue,
  canAutoLoadOpenApiReference,
  operationReferenceParts,
  parseOpenApiSource,
  type ApiCatalogue,
  type OpenApiOperation,
} from "./openapi";

export async function loadCataloguesForSpec(
  spec: ArazzoSpec,
  pageUrl = window.location.href,
  fetchSource: typeof fetch = fetch,
): Promise<ApiCatalogue[]> {
  return Promise.all(
    spec.sourceDescriptions.map(async (sourceDescription) => {
      const fallback = importedOperations(spec, sourceDescription.name);
      const fallbackCatalogue: ApiCatalogue = {
        sourceName: sourceDescription.name,
        title: sourceDescription.name,
        location: sourceDescription.url,
        operations: fallback,
      };
      if (!canAutoLoadOpenApiReference(sourceDescription.url, pageUrl)) {
        return fallbackCatalogue;
      }
      try {
        const response = await fetchSource(
          new URL(sourceDescription.url, pageUrl),
        );
        if (!response.ok) throw new Error("Source response was not successful.");
        const document = parseOpenApiSource(await response.text());
        const loaded = buildCatalogue(
          document,
          sourceDescription.name,
          sourceDescription.url,
        );
        return {
          ...loaded,
          operations: mergeOperations(loaded.operations, fallback),
        };
      } catch {
        return fallbackCatalogue;
      }
    }),
  );
}

function importedOperations(
  spec: ArazzoSpec,
  sourceName: string,
): OpenApiOperation[] {
  const ids = new Set<string>();
  for (const workflow of spec.workflows) {
    for (const step of workflow.steps) {
      const reference = operationReferenceParts(step.operationId);
      if (!reference || reference.sourceName !== sourceName) continue;
      ids.add(reference.operationId);
    }
  }

  return Array.from(ids, (id) => ({
    id,
    method: "REF",
    path: "Referenced by imported Arazzo",
    summary: id,
    resolved: false,
    sourceName,
    sourceTitle: sourceName,
  }));
}

function mergeOperations(
  primary: OpenApiOperation[],
  fallback: OpenApiOperation[],
): OpenApiOperation[] {
  const merged = new Map(primary.map((operation) => [operation.id, operation]));
  for (const operation of fallback) {
    if (!merged.has(operation.id)) merged.set(operation.id, operation);
  }
  return Array.from(merged.values()).sort((a, b) =>
    a.summary.localeCompare(b.summary),
  );
}
