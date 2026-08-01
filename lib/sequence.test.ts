import { describe, expect, it } from "vitest";
import type { ArazzoSpec } from "./arazzo";
import type { ApiCatalogue } from "./openapi";
import {
  sequenceCallDetail,
  sequenceCallDetails,
  sequenceLanes,
  sequenceToMermaid,
  statusCodeFromCriteria,
} from "./sequence";

describe("sequenceLanes", () => {
  it("adds a single runner lane plus one lane per real API, in first-appearance order", () => {
    const spec: ArazzoSpec = {
      arazzo: "1.0.1",
      info: { title: "Multi-API", version: "1.0.0" },
      sourceDescriptions: [
        { name: "deel", url: "/deel.json" },
        { name: "billing", url: "/billing.json" },
      ],
      workflows: [
        {
          workflowId: "find-worker-contracts",
          steps: [
            {
              stepId: "find-worker",
              operationId: "$sourceDescriptions.deel.findWorker",
            },
            {
              stepId: "charge-worker",
              operationId: "$sourceDescriptions.billing.charge",
            },
            {
              stepId: "load-contracts",
              operationId: "$sourceDescriptions.deel.loadContracts",
            },
          ],
        },
      ],
    };

    const lanes = sequenceLanes(spec, spec.workflows[0], []);

    expect(lanes.map((lane) => lane.key)).toEqual([
      "runner",
      "source:deel",
      "source:billing",
    ]);
    expect(lanes[0]).toMatchObject({ kind: "runner", label: "This workflow" });
    expect(lanes[1]).toMatchObject({ kind: "source", sublabel: "sourceDescriptions.deel" });
  });

  it("uses the catalogue title when the API is resolved", () => {
    const spec: ArazzoSpec = {
      arazzo: "1.0.1",
      info: { title: "Resolved", version: "1.0.0" },
      sourceDescriptions: [{ name: "deel", url: "/deel.json" }],
      workflows: [
        {
          workflowId: "find-worker",
          steps: [
            { stepId: "find-worker", operationId: "$sourceDescriptions.deel.findWorker" },
          ],
        },
      ],
    };
    const catalogues: ApiCatalogue[] = [
      {
        sourceName: "deel",
        title: "Deel API",
        location: "/deel.json",
        operations: [
          {
            id: "findWorker",
            method: "GET",
            path: "/rest/v2/people",
            summary: "List of people",
            resolved: true,
          },
        ],
      },
    ];

    const lanes = sequenceLanes(spec, spec.workflows[0], catalogues);
    expect(lanes[1]).toMatchObject({ key: "source:deel", label: "Deel API" });
  });

  it("adds a workflow-kind lane for a nested workflow step", () => {
    const spec: ArazzoSpec = {
      arazzo: "1.0.1",
      info: { title: "Nested", version: "1.0.0" },
      sourceDescriptions: [],
      workflows: [
        {
          workflowId: "outer",
          steps: [{ stepId: "run-inner", workflowId: "inner" }],
        },
        {
          workflowId: "inner",
          summary: "Inner workflow",
          steps: [],
        },
      ],
    };

    const lanes = sequenceLanes(spec, spec.workflows[0], []);
    expect(lanes[1]).toMatchObject({
      key: "workflow:inner",
      label: "Inner workflow",
      kind: "workflow",
    });
  });
});

describe("statusCodeFromCriteria", () => {
  it("extracts a status code from a $statusCode criterion", () => {
    expect(statusCodeFromCriteria(["$statusCode == 200"])).toBe("200");
    expect(statusCodeFromCriteria(["$statusCode === 200"])).toBe("200");
    expect(statusCodeFromCriteria(["$response.body#/ok == true"])).toBeNull();
  });
});

describe("sequenceCallDetail / sequenceCallDetails", () => {
  const spec: ArazzoSpec = {
    arazzo: "1.0.1",
    info: { title: "Detail", version: "1.0.0" },
    sourceDescriptions: [{ name: "deel", url: "/deel.json" }],
    workflows: [
      {
        workflowId: "find-worker",
        inputs: {
          properties: { worker_email: { type: "string" } },
          required: ["worker_email"],
        },
        steps: [
          {
            stepId: "find-worker",
            operationId: "$sourceDescriptions.deel.findWorker",
            parameters: [{ name: "search", in: "query", value: "$inputs.worker_email" }],
            successCriteria: [{ condition: "$statusCode == 200" }],
            outputs: { worker_id: "$response.body#/data/0/id" },
          },
        ],
      },
    ],
  };
  const catalogues: ApiCatalogue[] = [
    {
      sourceName: "deel",
      title: "Deel API",
      location: "/deel.json",
      operations: [
        {
          id: "findWorker",
          method: "GET",
          path: "/rest/v2/people",
          summary: "List of people",
          resolved: true,
        },
      ],
    },
  ];

  it("normalizes a step's operation, bindings, status code, and outputs", () => {
    const workflow = spec.workflows[0];
    const detail = sequenceCallDetail(spec, workflow, workflow.steps[0], catalogues);

    expect(detail.index).toBe(0);
    expect(detail.participant).toMatchObject({ key: "source:deel", label: "Deel API" });
    expect(detail.operation).toMatchObject({ method: "GET", path: "/rest/v2/people" });
    expect(detail.catalogueTitle).toBe("Deel API");
    expect(detail.requestBindings).toHaveLength(1);
    expect(detail.statusCode).toBe("200");
    expect(detail.outputs).toEqual({ worker_id: "$response.body#/data/0/id" });
  });

  it("returns one detail per step, in order", () => {
    const details = sequenceCallDetails(spec, spec.workflows[0], catalogues);
    expect(details.map((detail) => detail.step.stepId)).toEqual(["find-worker"]);
  });

  it("exports the same real participants and request exchange as Mermaid", () => {
    const mermaid = sequenceToMermaid(spec, spec.workflows[0], catalogues);

    expect(mermaid).toContain("sequenceDiagram");
    expect(mermaid).toContain("participant runner as This workflow");
    expect(mermaid).toContain("participant target1 as Deel API");
    expect(mermaid).toContain("runner->>+target1: GET /rest/v2/people");
    expect(mermaid).toContain("query.search = $inputs.worker_email");
    expect(mermaid).toContain("target1-->>-runner: Response 200");
    expect(mermaid).not.toContain("Initiator");
    expect(mermaid).not.toContain("Integrating application");
  });
});
