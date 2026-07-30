import { describe, expect, it } from "vitest";
import type { ArazzoWorkflow } from "./arazzo";
import {
  defaultWorkflowLayout,
  embeddedWorkflowLayout,
  workflowLayoutExtension,
} from "./workflow-layout";

const workflow: ArazzoWorkflow = {
  workflowId: "example",
  steps: [
    {
      stepId: "first",
      operationId: "$sourceDescriptions.api.first",
    },
    {
      stepId: "second",
      operationId: "$sourceDescriptions.api.second",
    },
  ],
};

describe("workflow layout", () => {
  it("creates a deterministic local layout without changing execution order", () => {
    const layout = defaultWorkflowLayout(workflow);

    expect(Object.keys(layout)).toEqual(["input", "first", "second", "output"]);
    expect(layout.first).toEqual({ x: 310, y: 110 });
    expect(layout.second).toEqual({ x: 590, y: 210 });
  });

  it("round-trips the supported portable extension", () => {
    const nodes = {
      input: { x: 20, y: 30 },
      first: { x: 240, y: 80 },
    };
    const withLayout: ArazzoWorkflow = {
      ...workflow,
      "x-loom-layout": workflowLayoutExtension(nodes),
    };

    expect(embeddedWorkflowLayout(withLayout)).toEqual(nodes);
  });

  it("ignores unsupported layout versions", () => {
    const withFutureLayout = {
      ...workflow,
      "x-loom-layout": {
        version: 2,
        nodes: { first: { x: 1, y: 2 } },
      },
    } as unknown as ArazzoWorkflow;

    expect(embeddedWorkflowLayout(withFutureLayout)).toBeNull();
  });
});
