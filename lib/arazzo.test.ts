import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findWorkflowStepAtOffset,
  findWorkflowStepRange,
  insertWorkflow,
  parseArazzo,
  setWorkflowLayoutExtension,
  upsertSourceDescription,
  workflowToSequence,
  type ArazzoWorkflow,
} from "./arazzo";

const starter = readFileSync(
  resolve(process.cwd(), "public/workflows/deel-arazzo.yml"),
  "utf8",
);

describe("Arazzo document services", () => {
  it("parses the bundled Deel document without structural errors", () => {
    const result = parseArazzo(starter);
    expect(result.spec?.info.title).toBe("Deel API workflow collection");
    expect(
      result.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    ).toHaveLength(0);
  });

  it("inserts a workflow without replacing existing workflows", () => {
    const workflow: ArazzoWorkflow = {
      workflowId: "list-time-off",
      summary: "List time off",
      steps: [
        {
          stepId: "load-time-off",
          operationId: "$sourceDescriptions.deel.getTimeOffs",
          successCriteria: [{ condition: "$statusCode == 200" }],
        },
      ],
    };

    const next = insertWorkflow(starter, workflow);
    const result = parseArazzo(next);

    expect(result.spec?.workflows).toHaveLength(3);
    expect(result.spec?.workflows[0].workflowId).toBe("find-worker-contracts");
    expect(result.spec?.workflows[2].workflowId).toBe("list-time-off");
  });

  it("generates a sequence diagram from a workflow", () => {
    const result = parseArazzo(starter);
    const spec = result.spec!;
    const workflow = spec.workflows[0];

    const sequence = workflowToSequence(spec, workflow, [
      {
        sourceName: "deel",
        title: "Deel API",
        location: "/openapi.json",
        operations: [
          {
            id: "getPeople",
            method: "GET",
            path: "/rest/people",
            summary: "List people",
            resolved: true,
            responses: [
              {
                status: "200",
                description: "People returned",
                contentTypes: ["application/json"],
              },
            ],
          },
        ],
      },
    ]);

    expect(sequence).toContain("sequenceDiagram");
    expect(sequence).toContain("participant node_deel as Deel API [deel]");
    expect(sequence).toContain("GET /rest/people · List people");
    expect(sequence).toContain("query.search ← input · worker_email");
    expect(sequence).toContain("node_deel-->>-Client: 200 · People returned");
    expect(sequence).toContain("Expects · $statusCode == 200");
    expect(sequence).toContain("worker_id ← response body · /data/0/id");
    expect(sequence).toContain("Workflow outputs");
  });

  it("accepts an imported Arazzo JSON document", () => {
    const json = JSON.stringify({
      arazzo: "1.0.1",
      info: { title: "Imported collection", version: "1.0.0" },
      sourceDescriptions: [
        {
          name: "family",
          url: "https://example.com/openapi.json",
          type: "openapi",
        },
      ],
      workflows: [
        {
          workflowId: "say-hello",
          summary: "Say hello",
          steps: [
            {
              stepId: "hello",
              operationId: "$sourceDescriptions.family.sayHello",
            },
          ],
        },
      ],
    });

    const result = parseArazzo(json);
    expect(result.spec?.info.title).toBe("Imported collection");
    expect(
      result.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    ).toHaveLength(0);
  });

  it("rejects document shapes that the workspace cannot render safely", () => {
    const withoutWorkflows = parseArazzo(`
arazzo: 1.0.1
info: { title: Broken, version: 1.0.0 }
sourceDescriptions: []
`);
    const scalarWorkflows = parseArazzo(`
arazzo: 1.0.1
info: { title: Broken, version: 1.0.0 }
sourceDescriptions: []
workflows: hello
`);
    const scalarSources = parseArazzo(`
arazzo: 1.0.1
info: { title: Broken, version: 1.0.0 }
sourceDescriptions: hello
workflows: []
`);

    expect(withoutWorkflows.spec).toBeNull();
    expect(scalarWorkflows.spec).toBeNull();
    expect(scalarSources.spec).toBeNull();
    expect(
      withoutWorkflows.diagnostics.some(
        (diagnostic) => diagnostic.path === "workflows",
      ),
    ).toBe(true);
    expect(
      scalarSources.diagnostics.some(
        (diagnostic) => diagnostic.path === "sourceDescriptions",
      ),
    ).toBe(true);
  });

  it("reports duplicate workflow IDs independently of ID format warnings", () => {
    const result = parseArazzo(`
arazzo: 1.0.1
info: { title: Duplicate IDs, version: 1.0.0 }
sourceDescriptions:
  - name: api
    url: /openapi.json
workflows:
  - workflowId: a.b
    steps:
      - stepId: first
        operationId: $sourceDescriptions.api.first
  - workflowId: a.b
    steps:
      - stepId: second
        operationId: $sourceDescriptions.api.second
`);

    expect(
      result.diagnostics.filter((diagnostic) =>
        diagnostic.message.includes("should use letters"),
      ),
    ).toHaveLength(2);
    expect(
      result.diagnostics.some((diagnostic) =>
        diagnostic.message.includes('Duplicate workflow ID "a.b"'),
      ),
    ).toBe(true);
  });

  it("adds and updates named OpenAPI source descriptions", () => {
    const withPayments = upsertSourceDescription(starter, {
      name: "payments",
      type: "openapi",
      url: "./payments.openapi.yaml",
    });
    const added = parseArazzo(withPayments).spec!;

    expect(added.sourceDescriptions).toContainEqual({
      name: "payments",
      type: "openapi",
      url: "./payments.openapi.yaml",
    });

    const updated = parseArazzo(
      upsertSourceDescription(withPayments, {
        name: "payments",
        type: "openapi",
        url: "https://example.com/openapi.json",
      }),
    ).spec!;
    expect(
      updated.sourceDescriptions.filter((source) => source.name === "payments"),
    ).toEqual([
      {
        name: "payments",
        type: "openapi",
        url: "https://example.com/openapi.json",
      },
    ]);
  });

  it("adds and removes a portable workflow layout extension", () => {
    const embedded = setWorkflowLayoutExtension(
      starter,
      "find-worker-contracts",
      {
        version: 1,
        nodes: {
          input: { x: 40, y: 165 },
          "find-worker": { x: 310, y: 110 },
        },
      },
    );
    expect(
      parseArazzo(embedded).spec!.workflows[0]["x-arazzo-builder-layout"],
    ).toEqual({
      version: 1,
      nodes: {
        input: { x: 40, y: 165 },
        "find-worker": { x: 310, y: 110 },
      },
    });

    const removed = setWorkflowLayoutExtension(
      embedded,
      "find-worker-contracts",
      null,
    );
    expect(
      parseArazzo(removed).spec!.workflows[0]["x-arazzo-builder-layout"],
    ).toBeUndefined();
  });

  it("maps YAML offsets to workflow steps in both directions", () => {
    const range = findWorkflowStepRange(
      starter,
      "find-worker-contracts",
      "load-contracts",
    );

    expect(range).not.toBeNull();
    expect(starter.slice(range!.start, range!.end)).toContain(
      "stepId: load-contracts",
    );
    expect(findWorkflowStepAtOffset(starter, range!.start + 10)).toEqual({
      workflowId: "find-worker-contracts",
      stepId: "load-contracts",
    });
  });

  it("does not copy source URLs into generated Mermaid", () => {
    const spec = parseArazzo(starter).spec!;
    spec.sourceDescriptions[0].url =
      "https://example.com/openapi.json\nparticipant Injected";

    const sequence = workflowToSequence(spec, spec.workflows[0]);
    expect(sequence).not.toContain("https://example.com");
    expect(sequence).not.toContain("participant Injected");
  });
});
