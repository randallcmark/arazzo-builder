import { describe, expect, it, vi } from "vitest";
import type { ArazzoSpec } from "./arazzo";
import { loadCataloguesForSpec } from "./api-catalogues";

const importedSpec: ArazzoSpec = {
  arazzo: "1.0.1",
  info: { title: "Imported", version: "1.0.0" },
  sourceDescriptions: [
    {
      name: "payments",
      type: "openapi",
      url: "https://api.example/openapi.json",
    },
  ],
  workflows: [
    {
      workflowId: "pay",
      steps: [
        {
          stepId: "create",
          operationId: "$sourceDescriptions.payments.createPayment",
        },
      ],
    },
  ],
};

describe("Arazzo API catalogue loading", () => {
  it("does not fetch cross-origin sources named by an imported document", async () => {
    const fetchSource = vi.fn();
    const catalogues = await loadCataloguesForSpec(
      importedSpec,
      "https://builder.example/workspace",
      fetchSource as unknown as typeof fetch,
    );

    expect(fetchSource).not.toHaveBeenCalled();
    expect(catalogues[0].operations).toEqual([
      expect.objectContaining({
        id: "createPayment",
        resolved: false,
      }),
    ]);
  });

  it("loads a same-origin source and retains referenced fallback operations", async () => {
    const fetchSource = vi.fn(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          openapi: "3.1.0",
          info: { title: "Payments" },
          paths: {
            "/payments": {
              post: {
                operationId: "createPayment",
                summary: "Create payment",
              },
            },
          },
        }),
    }));
    const spec = {
      ...importedSpec,
      sourceDescriptions: [
        {
          ...importedSpec.sourceDescriptions[0],
          url: "/openapi.json",
        },
      ],
    };

    const catalogues = await loadCataloguesForSpec(
      spec,
      "https://builder.example/workspace",
      fetchSource as unknown as typeof fetch,
    );

    expect(fetchSource).toHaveBeenCalledOnce();
    expect(catalogues[0].operations[0]).toMatchObject({
      id: "createPayment",
      resolved: true,
    });
  });
});
