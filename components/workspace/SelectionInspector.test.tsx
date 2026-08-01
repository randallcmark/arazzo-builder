// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArazzoWorkflow } from "@/lib/arazzo";
import type { ApiCatalogue } from "@/lib/openapi";
import type { WorkflowEdge } from "@/lib/workflow-graph";
import { SelectionInspector } from "./SelectionInspector";

const workflow: ArazzoWorkflow = {
  workflowId: "create-and-check",
  steps: [
    {
      stepId: "create",
      description: "Create a record.",
      operationId: "$sourceDescriptions.family.createRecord",
      requestBody: {
        contentType: "application/json",
        payload: { title: "$inputs.title" },
      },
      successCriteria: [{ condition: "$statusCode == 201" }],
      outputs: { record_id: "$response.body#/id" },
      onFailure: [
        { type: "retry", retryLimit: 3, retryAfter: 2 },
      ],
    },
    {
      stepId: "check",
      operationId: "$sourceDescriptions.family.getRecord",
      parameters: [
        {
          name: "record_id",
          in: "path",
          value: "$steps.create.outputs.record_id",
        },
      ],
    },
  ],
};

const catalogues: ApiCatalogue[] = [
  {
    sourceName: "family",
    title: "Family API",
    location: "/family.openapi.json",
    operations: [
      {
        id: "createRecord",
        method: "POST",
        path: "/records",
        summary: "Create record",
        description: "Creates a record in the family account.",
        resolved: true,
        tags: ["Records"],
        parameters: [
          {
            name: "Idempotency-Key",
            location: "header",
            required: true,
            schema: "string",
          },
        ],
        requestBody: {
          required: true,
          contentTypes: ["application/json"],
        },
        responses: [
          {
            status: "201",
            description: "Record created",
            contentTypes: ["application/json"],
          },
        ],
        security: ["bearerAuth"],
        servers: ["https://api.family.example"],
      },
    ],
  },
];

describe("selection inspector", () => {
  afterEach(cleanup);

  it("unpicks the selected Arazzo step and resolved OpenAPI operation", () => {
    render(
      <SelectionInspector
        workflow={workflow}
        selectedStepId="create"
        selectedEdge={null}
        catalogues={catalogues}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "create" })).toBeTruthy();
    expect(screen.getByText("POST")).toBeTruthy();
    expect(screen.getByText("/records")).toBeTruthy();
    expect(screen.getByText("Idempotency-Key")).toBeTruthy();
    expect(screen.getAllByText("$inputs.title")).toHaveLength(2);
    expect(screen.getByText("$statusCode == 201")).toBeTruthy();
    expect(screen.getByText("record_id")).toBeTruthy();
    expect(screen.getByText("bearerAuth")).toBeTruthy();
    expect(screen.getByText("3 attempts · 2s delay")).toBeTruthy();
  });

  it("shows values exchanged across a selected chart link", () => {
    const edge: WorkflowEdge = {
      id: "implicit:create:check",
      source: "create",
      target: "check",
      sourceStepId: "create",
      targetStepId: "check",
      kind: "implicit",
    };
    render(
      <SelectionInspector
        workflow={workflow}
        selectedStepId={null}
        selectedEdge={edge}
        catalogues={catalogues}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Exchange between steps")).toBeTruthy();
    expect(screen.getByText("path.record_id")).toBeTruthy();
    expect(screen.getAllByText("$steps.create.outputs.record_id").length).toBeGreaterThan(0);
  });
});
