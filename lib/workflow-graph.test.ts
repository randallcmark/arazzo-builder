import { describe, expect, it } from "vitest";
import type { ArazzoWorkflow } from "./arazzo";
import { workflowEdges } from "./workflow-graph";

describe("workflow graph projection", () => {
  it("creates implicit sequential edges for an ordered workflow", () => {
    const workflow: ArazzoWorkflow = {
      workflowId: "ordered",
      steps: [
        { stepId: "first", operationId: "one" },
        { stepId: "second", operationId: "two" },
      ],
    };

    expect(workflowEdges(workflow).map((edge) => edge.kind)).toEqual([
      "system",
      "implicit",
      "system",
    ]);
  });

  it("projects explicit success, failure, retry, and end actions", () => {
    const workflow: ArazzoWorkflow = {
      workflowId: "branched",
      steps: [
        {
          stepId: "first",
          operationId: "one",
          onSuccess: [
            { name: "continue", type: "goto", stepId: "second" },
          ],
          onFailure: [
            { name: "try again", type: "retry" },
            { name: "stop", type: "end" },
          ],
        },
        { stepId: "second", operationId: "two" },
      ],
    };

    const edges = workflowEdges(workflow);
    expect(edges.map((edge) => edge.kind)).toEqual([
      "system",
      "success",
      "retry",
      "end",
      "system",
    ]);
    expect(edges.find((edge) => edge.kind === "retry")).toMatchObject({
      source: "first",
      target: "first",
      channel: "onFailure",
    });
  });
});
