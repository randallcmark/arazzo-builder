// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { siteConfig } from "@/config/site";
import { encodeStoredWorkspace } from "@/lib/workspace-storage";
import { Workspace } from "./Workspace";

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockMonacoEditor({
      value,
      onChange,
    }: {
      value: string;
      onChange: (value: string) => void;
    }) {
      return (
        <textarea
          aria-label="YAML source editor"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    },
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("./FlowView", () => ({
  FlowView: ({
    mode,
    onStepSelect,
    onEdgeSelect,
  }: {
    mode: string;
    onStepSelect: (stepId: string) => void;
    onEdgeSelect: (edgeId: string) => void;
  }) => (
    <div data-testid="flow-view">
      Flow projection
      <button onClick={() => onStepSelect("find-worker")}>Select flow step</button>
      {mode === "dataflow" && (
        <button onClick={() => onEdgeSelect("data:input:find-worker")}>Select data edge</button>
      )}
    </div>
  ),
}));
vi.mock("./SequenceView", () => ({
  SequenceView: ({
    selectedStepId,
    onStepSelect,
  }: {
    selectedStepId: string | null;
    onStepSelect: (stepId: string) => void;
  }) => (
    <div>
      Sequence projection
      <button onClick={() => onStepSelect("find-worker")}>Select sequence call</button>
      <span data-testid="sequence-selected-step">{selectedStepId ?? "none"}</span>
    </div>
  ),
}));
vi.mock("./DocumentationView", () => ({
  DocumentationView: () => <div>Documentation projection</div>,
}));
vi.mock("./SelectionInspector", () => ({
  SelectionInspector: ({
    selectedStepId,
    selectedEdge,
  }: {
    selectedStepId: string | null;
    selectedEdge: { kind: string } | null;
  }) => (
    <aside>
      {selectedStepId
        ? "Selected step inspector"
        : selectedEdge
          ? `Selected ${selectedEdge.kind} edge inspector`
          : "Empty step inspector"}
    </aside>
  ),
}));
vi.mock("./AddWorkflowDialog", () => ({
  AddWorkflowDialog: () => null,
}));
vi.mock("./ApiSourceDialog", () => ({
  ApiSourceDialog: () => null,
}));

const publishedSource = readFileSync(
  resolve(process.cwd(), "public/workflows/deel-arazzo.yml"),
  "utf8",
);

const malformedSource = `
arazzo: 1.0.1
info: { title: Needs repair, version: 1.0.0 }
sourceDescriptions: []
workflows: hello
`;

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

describe("Workspace recovery", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createMemoryStorage(),
    });
    window.localStorage.clear();
    window.localStorage.setItem(
      siteConfig.draftStorageKey,
      encodeStoredWorkspace({
        source: malformedSource,
        baseline: publishedSource,
        name: "broken-arazzo.yml",
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () => publishedSource,
      })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("opens the YAML editor and recovers from an invalid saved document", async () => {
    const user = userEvent.setup();
    render(<Workspace />);

    expect(
      await screen.findByRole("heading", { name: "The YAML needs attention" }),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Open YAML" }));
    const editor = screen.getByRole("textbox", { name: "YAML source editor" });
    expect((editor as HTMLTextAreaElement).value).toBe(malformedSource);

    fireEvent.change(editor, { target: { value: publishedSource } });
    await user.click(screen.getByRole("tab", { name: "Graph" }));

    expect(await screen.findByTestId("flow-view")).toBeTruthy();
  });

  it("reports clipboard rejection without claiming the copy succeeded", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("Permission denied")),
      },
    });
    render(<Workspace />);

    await screen.findByRole("heading", { name: "The YAML needs attention" });
    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(
      await screen.findByText(
        "Clipboard access was denied. Use the YAML editor to copy instead.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("YAML copied to clipboard")).toBeNull();
  });

  it("imports a valid Arazzo file without fetching its cross-origin source", async () => {
    const user = userEvent.setup();
    const { container } = render(<Workspace />);
    await screen.findByRole("heading", { name: "The YAML needs attention" });
    const fileInput = container.querySelector<HTMLInputElement>(
      "input[type='file']",
    );
    const imported = new File(
      [
        JSON.stringify({
          arazzo: "1.0.1",
          info: { title: "Imported", version: "1.0.0" },
          sourceDescriptions: [
            {
              name: "payments",
              url: "https://api.example/openapi.json",
              type: "openapi",
            },
          ],
          workflows: [
            {
              workflowId: "pay",
              steps: [
                {
                  stepId: "create",
                  operationId:
                    "$sourceDescriptions.payments.createPayment",
                },
              ],
            },
          ],
        }),
      ],
      "imported-arazzo.json",
      { type: "application/json" },
    );

    expect(fileInput).toBeTruthy();
    await user.upload(fileInput!, imported);

    expect(await screen.findByTestId("flow-view")).toBeTruthy();
    expect(screen.getByText("imported-arazzo.json")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("restores drafts from the legacy storage key during the rename", async () => {
    window.localStorage.removeItem(siteConfig.draftStorageKey);
    window.localStorage.setItem(
      siteConfig.legacyDraftStorageKeys[0],
      encodeStoredWorkspace({
        source: malformedSource,
        baseline: publishedSource,
        name: "legacy-draft.yml",
      }),
    );
    render(<Workspace />);

    expect(
      await screen.findByRole("heading", { name: "The YAML needs attention" }),
    ).toBeTruthy();
    expect(screen.getByText("legacy-draft.yml")).toBeTruthy();
  });

  it("keeps the selected step when switching between Graph and Sequence", async () => {
    const user = userEvent.setup();
    window.localStorage.clear();
    render(<Workspace />);

    await screen.findByTestId("flow-view");
    await user.click(screen.getByRole("button", { name: "Select flow step" }));
    expect(screen.getByText("Selected step inspector")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Sequence" }));
    expect(screen.getByTestId("sequence-selected-step").textContent).toBe(
      "find-worker",
    );
    expect(screen.getByText("Selected step inspector")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Graph" }));
    expect(screen.getByText("Selected step inspector")).toBeTruthy();
  });

  it("keeps a stable inspector rail across all workspace views", async () => {
    const user = userEvent.setup();
    window.localStorage.clear();
    render(<Workspace />);

    await screen.findByTestId("flow-view");
    expect(screen.getByText("Empty step inspector")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Select flow step" }));
    await user.click(screen.getByRole("tab", { name: "Docs" }));
    expect(screen.getByText("Selected step inspector")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "YAML" }));
    expect(screen.getByText("Selected step inspector")).toBeTruthy();
  });

  it("resolves a selected data-flow edge into the inspector", async () => {
    const user = userEvent.setup();
    window.localStorage.clear();
    render(<Workspace />);

    await screen.findByTestId("flow-view");
    await user.click(screen.getByRole("tab", { name: "Data flow" }));
    await user.click(screen.getByRole("button", { name: "Select data edge" }));

    expect(screen.getByText("Selected data edge inspector")).toBeTruthy();
  });
});
