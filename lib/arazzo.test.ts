import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  insertWorkflow,
  parseArazzo,
  upsertSourceDescription,
  workflowToFlowchart,
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

  it("generates both diagram formats from the same workflow", () => {
    const result = parseArazzo(starter);
    const spec = result.spec!;
    const workflow = spec.workflows[0];

    expect(workflowToFlowchart(workflow)).toContain("flowchart LR");
    expect(workflowToFlowchart(workflow)).toContain("find_worker");
    expect(workflowToSequence(spec, workflow)).toContain("sequenceDiagram");
    expect(workflowToSequence(spec, workflow)).toContain("participant node_deel");
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
});
