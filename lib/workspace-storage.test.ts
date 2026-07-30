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
              sourceName: "family",
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
});
