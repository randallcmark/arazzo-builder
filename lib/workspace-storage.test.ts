import { describe, expect, it } from "vitest";
import {
  decodeStoredWorkspace,
  encodeStoredWorkspace,
  type StoredWorkspace,
} from "./workspace-storage";

describe("workspace storage", () => {
  it("round-trips an imported workspace and its reset baseline", () => {
    const workspace: StoredWorkspace = {
      source: "arazzo: 1.0.1\nworkflows: []\n",
      baseline: "arazzo: 1.0.1\nworkflows: []\n",
      name: "family-api.arazzo.yaml",
      catalogues: [
        {
          sourceName: "family",
          title: "Family API",
          location: "./family.openapi.yaml",
          operations: [
            {
              id: "sayHello",
              method: "GET",
              path: "/hello",
              summary: "Say hello",
              resolved: true,
              sourceName: "family",
              description: "Returns a family greeting.",
              tags: ["Greeting"],
              parameters: [
                {
                  name: "language",
                  location: "query",
                  required: false,
                  schema: "string",
                },
              ],
              requestBody: {
                required: false,
                contentTypes: ["application/json"],
              },
              responses: [
                {
                  status: "200",
                  description: "Greeting returned",
                  contentTypes: ["application/json"],
                },
              ],
              security: ["familyAuth"],
              servers: ["https://family.example"],
            },
          ],
        },
      ],
    };

    expect(decodeStoredWorkspace(encodeStoredWorkspace(workspace))).toEqual(
      workspace,
    );
  });

  it("restores legacy raw-YAML drafts", () => {
    const source = "arazzo: 1.0.1\ninfo:\n  title: Legacy\n";

    expect(decodeStoredWorkspace(source)).toEqual({
      source,
      baseline: source,
      name: "deel-arazzo.yml",
      catalogues: undefined,
    });
  });

  it("migrates unresolved operation sentinels in saved catalogues", () => {
    const stored = JSON.stringify({
      source: "arazzo: 1.0.1",
      baseline: "arazzo: 1.0.1",
      name: "legacy.yml",
      catalogues: [
        {
          sourceName: "family",
          title: "Family",
          location: "https://example.com/openapi.json",
          operations: [
            {
              id: "sayHello",
              method: "OP",
              path: "Referenced by imported Arazzo",
              summary: "sayHello",
            },
          ],
        },
      ],
    });

    expect(
      decodeStoredWorkspace(stored).catalogues?.[0].operations[0],
    ).toMatchObject({
      method: "REF",
      resolved: false,
    });
  });
});
