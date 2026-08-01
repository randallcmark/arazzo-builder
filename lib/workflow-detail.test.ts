import { describe, expect, it } from "vitest";
import {
  bindingsFromStep,
  requestContentType,
  stepRequestBindings,
} from "./workflow-detail";

describe("workflow detail projection", () => {
  it("flattens parameters and body values while retaining runtime dependencies", () => {
    const step = {
      stepId: "create-contract",
      operationId: "$sourceDescriptions.deel.createContract",
      parameters: [
        { name: "trace", in: "header", value: "$inputs.trace_id" },
      ],
      requestBody: {
        contentType: "application/json",
        payload: {
          title: "$inputs.title",
          worker: {
            id: "$steps.find-worker.outputs.worker_id",
          },
        },
        replacements: [
          { target: "/metadata/trace", value: "$inputs.trace_id" },
        ],
      },
    };

    expect(requestContentType(step)).toBe("application/json");
    expect(stepRequestBindings(step)).toEqual([
      {
        target: "header.trace",
        value: "$inputs.trace_id",
        expressions: ["$inputs.trace_id"],
        kind: "parameter",
      },
      {
        target: "body.title",
        value: "$inputs.title",
        expressions: ["$inputs.title"],
        kind: "body",
      },
      {
        target: "body.worker.id",
        value: "$steps.find-worker.outputs.worker_id",
        expressions: ["$steps.find-worker.outputs.worker_id"],
        kind: "body",
      },
      {
        target: "body#/metadata/trace",
        value: "$inputs.trace_id",
        expressions: ["$inputs.trace_id"],
        kind: "body",
      },
    ]);
    expect(bindingsFromStep(step, "find-worker")).toEqual([
      expect.objectContaining({
        target: "body.worker.id",
        value: "$steps.find-worker.outputs.worker_id",
      }),
    ]);
  });
});
