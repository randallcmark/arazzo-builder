// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const source = `
arazzo: 1.0.1
info:
  title: Records
  version: "1.0"
sourceDescriptions:
  - name: family
    url: /family.openapi.json
workflows:
  - workflowId: create-and-check
    steps:
      - stepId: create
        operationId: $sourceDescriptions.family.createRecord
      - stepId: check
        operationId: $sourceDescriptions.family.getRecord
`;

function renderInspector(overrides: Partial<Parameters<typeof SelectionInspector>[0]> = {}) {
  const onSelectStep = vi.fn();
  const onCopy = vi.fn();
  const onClose = vi.fn();
  render(
    <SelectionInspector
      workflow={workflow}
      source={source}
      selectedStepId="create"
      selectedEdge={null}
      catalogues={catalogues}
      onSelectStep={onSelectStep}
      onCopy={onCopy}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onSelectStep, onCopy, onClose };
}

describe("selection inspector", () => {
  afterEach(cleanup);

  it("shows the resolved OpenAPI contract on the default Contract tab", () => {
    renderInspector();

    expect(screen.getByRole("heading", { name: "create" })).toBeTruthy();
    expect(screen.getByText("Step 01 of 02")).toBeTruthy();
    expect(screen.getByText("POST")).toBeTruthy();
    expect(screen.getByText("/records")).toBeTruthy();
    expect(screen.getByText("Idempotency-Key")).toBeTruthy();
    expect(screen.getByText("Declared parameters versus this step")).toBeTruthy();
    expect(screen.getByText("Required · not set")).toBeTruthy();
    expect(screen.getByText("$statusCode == 201")).toBeTruthy();
    expect(screen.getByText("bearerAuth")).toBeTruthy();
  });

  it("shows request bindings, dependencies, and captured outputs on the Data tab", async () => {
    const user = userEvent.setup();
    renderInspector();

    await user.click(screen.getByRole("tab", { name: "Data" }));

    expect(screen.getAllByText("$inputs.title")).toHaveLength(2);
    expect(screen.getByText("record_id")).toBeTruthy();
  });

  it("shows onSuccess/onFailure actions on the Control flow tab", async () => {
    const user = userEvent.setup();
    renderInspector();

    await user.click(screen.getByRole("tab", { name: "Control flow" }));

    expect(screen.getByText("3 attempts · 2s delay")).toBeTruthy();
  });

  it("shows a read-only YAML snippet on the YAML tab", async () => {
    const user = userEvent.setup();
    renderInspector();

    await user.click(screen.getByRole("tab", { name: "YAML" }));

    expect(screen.getByText(/operationId: \$sourceDescriptions\.family\.createRecord/)).toBeTruthy();
  });

  it("navigates to the next and previous step", async () => {
    const user = userEvent.setup();
    const { onSelectStep } = renderInspector();

    expect(screen.getByRole("button", { name: "Previous step" })).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("button", { name: "Next step" }));
    expect(onSelectStep).toHaveBeenCalledWith("check");
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
    renderInspector({ selectedStepId: null, selectedEdge: edge });

    expect(screen.getByText("Exchange between steps")).toBeTruthy();
    expect(screen.getByText("path.record_id")).toBeTruthy();
    expect(screen.getAllByText("$steps.create.outputs.record_id").length).toBeGreaterThan(0);
  });

  it("shows an empty-state rail when nothing is selected", () => {
    renderInspector({ selectedStepId: null, selectedEdge: null });

    expect(screen.getByText("Select a step")).toBeTruthy();
    expect(
      screen.getByText(
        "Choose a step in Graph, Sequence, Docs, the workflow list, or YAML to inspect its contract and data flow.",
      ),
    ).toBeTruthy();
  });

  it("matches an Arazzo request binding to its declared OpenAPI parameter", () => {
    const boundWorkflow: ArazzoWorkflow = {
      ...workflow,
      steps: workflow.steps.map((step) =>
        step.stepId === "create"
          ? {
              ...step,
              parameters: [
                {
                  name: "Idempotency-Key",
                  in: "header",
                  value: "$inputs.idempotency_key",
                },
              ],
            }
          : step,
      ),
    };

    renderInspector({ workflow: boundWorkflow });

    expect(screen.getByText("$inputs.idempotency_key")).toBeTruthy();
    expect(screen.queryByText("Required · not set")).toBeNull();
  });
});
