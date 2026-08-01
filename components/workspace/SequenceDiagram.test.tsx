// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArazzoSpec } from "@/lib/arazzo";
import type { ApiCatalogue } from "@/lib/openapi";
import { SequenceDiagram } from "./SequenceDiagram";

const spec: ArazzoSpec = {
  arazzo: "1.0.1",
  info: { title: "Worker journey", version: "1.0.0" },
  sourceDescriptions: [
    { name: "deel", url: "/deel.json" },
    { name: "billing", url: "/billing.json" },
  ],
  workflows: [
    {
      workflowId: "find-and-charge",
      inputs: { properties: { email: { type: "string" } } },
      steps: [
        {
          stepId: "find-worker",
          operationId: "$sourceDescriptions.deel.findWorker",
          parameters: [{ name: "email", in: "query", value: "$inputs.email" }],
          outputs: { worker_id: "$response.body#/id" },
        },
        {
          stepId: "charge-worker",
          operationId: "$sourceDescriptions.billing.chargeWorker",
          parameters: [
            {
              name: "worker_id",
              in: "path",
              value: "$steps.find-worker.outputs.worker_id",
            },
          ],
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
        path: "/workers",
        summary: "Find worker",
        resolved: true,
      },
    ],
  },
  {
    sourceName: "billing",
    title: "Billing API",
    location: "/billing.json",
    operations: [
      {
        id: "chargeWorker",
        method: "POST",
        path: "/workers/{worker_id}/charges",
        summary: "Charge worker",
        resolved: true,
      },
    ],
  },
];

describe("SequenceDiagram", () => {
  afterEach(cleanup);

  it("renders real API lanes and exposes every call as an inspectable control", async () => {
    const user = userEvent.setup();
    const onStepSelect = vi.fn();
    render(
      <SequenceDiagram
        spec={spec}
        workflow={spec.workflows[0]}
        catalogues={catalogues}
        selectedStepId="find-worker"
        onStepSelect={onStepSelect}
      />,
    );

    expect(screen.getByLabelText("Sequence diagram of workflow calls")).toBeTruthy();
    expect(screen.getByText("This workflow")).toBeTruthy();
    expect(screen.getByText("Deel API")).toBeTruthy();
    expect(screen.getByText("Billing API")).toBeTruthy();
    expect(screen.queryByText("Initiator")).toBeNull();

    const firstCall = screen.getByRole("button", { name: "Inspect find-worker" });
    expect(firstCall.getAttribute("aria-pressed")).toBe("true");
    await user.click(firstCall);
    expect(onStepSelect).toHaveBeenCalledWith("find-worker");

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Inspect charge-worker" }),
      { key: "Enter" },
    );
    expect(onStepSelect).toHaveBeenCalledWith("charge-worker");
  });
});
