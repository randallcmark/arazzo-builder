// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArazzoSpec } from "@/lib/arazzo";
import type { ApiCatalogue } from "@/lib/openapi";
import { SequenceCallLog } from "./SequenceCallLog";

const spec: ArazzoSpec = {
  arazzo: "1.0.1",
  info: { title: "Worker journey", version: "1.0.0" },
  sourceDescriptions: [{ name: "deel", url: "/deel.json" }],
  workflows: [
    {
      workflowId: "find-worker",
      summary: "Find a worker",
      inputs: {
        properties: { email: { type: "string" } },
        required: ["email"],
      },
      steps: [
        {
          stepId: "find-worker",
          description: "Find the worker by email.",
          operationId: "$sourceDescriptions.deel.findWorker",
          parameters: [{ name: "email", in: "query", value: "$inputs.email" }],
          successCriteria: [{ condition: "$statusCode == 200" }],
          outputs: { worker_id: "$response.body#/id" },
        },
      ],
      outputs: { worker_id: "$steps.find-worker.outputs.worker_id" },
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
];

function renderLog() {
  const callbacks = {
    onStepSelect: vi.fn(),
    onCopyMarkdown: vi.fn(),
    onCopyMermaid: vi.fn(),
  };
  render(
    <SequenceCallLog
      spec={spec}
      workflow={spec.workflows[0]}
      catalogues={catalogues}
      selectedStepId={null}
      {...callbacks}
    />,
  );
  return callbacks;
}

describe("SequenceCallLog", () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("expands and selects a call so its request and response can be inspected", async () => {
    const user = userEvent.setup();
    const { onStepSelect } = renderLog();

    const call = screen.getByRole("button", {
      name: "01GET/workers· find-workerDeel API",
    });
    expect(call.getAttribute("aria-expanded")).toBe("false");
    await user.click(call);

    expect(call.getAttribute("aria-expanded")).toBe("true");
    expect(onStepSelect).toHaveBeenCalledWith("find-worker");
    expect(screen.getByText("query.email =")).toBeTruthy();
    expect(screen.getByText("Successful response")).toBeTruthy();
  });

  it("exports Markdown and portable Mermaid from the same call model", async () => {
    const user = userEvent.setup();
    const { onCopyMarkdown, onCopyMermaid } = renderLog();

    await user.click(screen.getByRole("button", { name: "Copy as Markdown" }));
    expect(onCopyMarkdown).toHaveBeenCalledWith(
      expect.stringContaining("GET /workers"),
    );
    expect(onCopyMarkdown).toHaveBeenCalledWith(
      expect.stringContaining("query.email ← $inputs.email"),
    );

    await user.click(screen.getByRole("button", { name: "Copy as Mermaid" }));
    expect(onCopyMermaid).toHaveBeenCalledWith(
      expect.stringContaining("sequenceDiagram"),
    );
    expect(onCopyMermaid).toHaveBeenCalledWith(
      expect.stringContaining("runner->>+target1: GET /workers"),
    );
  });

  it("expands the complete call log before printing", async () => {
    const user = userEvent.setup();
    const print = vi.fn();
    let printFrame: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      printFrame = callback;
      return 1;
    });
    vi.stubGlobal("print", print);
    renderLog();

    await user.click(screen.getByRole("button", { name: "Print" }));

    expect(screen.getByText("Successful response")).toBeTruthy();
    expect(print).not.toHaveBeenCalled();
    expect(printFrame).toBeTruthy();
    printFrame!(0);
    expect(print).toHaveBeenCalledOnce();
  });
});
