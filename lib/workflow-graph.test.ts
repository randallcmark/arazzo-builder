import { describe, expect, it } from "vitest";
import type { ArazzoWorkflow } from "./arazzo";
import { workflowDataEdges, workflowEdges } from "./workflow-graph";

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

  it("projects inputs, inter-step outputs, and workflow outputs as data edges", () => {
    const workflow: ArazzoWorkflow = {
      workflowId: "data-flow",
      inputs: {
        properties: { email: { type: "string" } },
      },
      steps: [
        {
          stepId: "find",
          operationId: "findWorker",
          parameters: [{ name: "email", in: "query", value: "$inputs.email" }],
          outputs: { worker_id: "$response.body#/id" },
        },
        {
          stepId: "load",
          operationId: "loadWorker",
          parameters: [
            {
              name: "worker_id",
              in: "path",
              value: "$steps.find.outputs.worker_id",
            },
          ],
          outputs: { contract_id: "$response.body#/contract_id" },
        },
      ],
      outputs: {
        contract_id: "$steps.load.outputs.contract_id",
      },
    };

    expect(workflowDataEdges(workflow)).toEqual([
      expect.objectContaining({ source: "input", target: "find", label: "email", kind: "data" }),
      expect.objectContaining({ source: "find", target: "load", label: "worker_id", kind: "data" }),
      expect.objectContaining({ source: "load", target: "output", label: "contract_id", kind: "data" }),
    ]);
  });
});
