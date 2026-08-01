// @vitest-environment jsdom

import mermaid from "mermaid";
import { describe, expect, it } from "vitest";
import { workflowToSequence, type ArazzoSpec } from "./arazzo";

describe("Arazzo sequence projection", () => {
  it("produces Mermaid syntax for detailed requests, responses, and transitions", async () => {
    const spec: ArazzoSpec = {
      arazzo: "1.0.1",
      info: { title: "Detailed", version: "1.0.0" },
      sourceDescriptions: [{ name: "api", url: "/openapi.json" }],
      workflows: [
        {
          workflowId: "create",
          inputs: {
            properties: { title: { type: "string" } },
            required: ["title"],
          },
          steps: [
            {
              stepId: "create-record",
              operationId: "$sourceDescriptions.api.createRecord",
              requestBody: {
                contentType: "application/json",
                payload: { title: "$inputs.title" },
              },
              successCriteria: [{ condition: "$statusCode >= 200" }],
              outputs: { id: "$response.body#/id" },
              onFailure: [{ type: "retry", retryLimit: 2 }],
            },
          ],
          outputs: { id: "$steps.create-record.outputs.id" },
        },
      ],
    };
    const chart = workflowToSequence(spec, spec.workflows[0]);

    expect(chart).toContain("actor Initiator as Initiator");
    expect(chart).toContain("participant Client as Integrating application");
    expect(chart).toContain("Initiator-->>Client: Start · create");
    expect(chart).toContain("Client->>+node_api: createRecord");
    expect(chart).toContain("node_api-->>-Client: Response");
    expect(chart).toContain("Client-->>Initiator: Complete · id");
    expect(chart).toContain("$statusCode ≥ 200");
    await expect(mermaid.parse(chart)).resolves.toBeTruthy();
  });

  it("accepts multiline JSON strings in request bindings", async () => {
    const spec: ArazzoSpec = {
      arazzo: "1.0.1",
      info: { title: "OAuth", version: "1.0.0" },
      sourceDescriptions: [{ name: "auth", url: "/openapi.json" }],
      workflows: [
        {
          workflowId: "authorize",
          steps: [
            {
              stepId: "exchange-code",
              operationId: "$sourceDescriptions.auth.exchangeCode",
              requestBody: {
                contentType: "application/json",
                payload: `{
  "grant_type": "authorization_code",
  "code": "$inputs.authorization_code",
  "scope": "people & contracts;read"
}`,
              },
              successCriteria: [{ condition: "$statusCode == 200" }],
            },
          ],
        },
      ],
    };
    const chart = workflowToSequence(spec, spec.workflows[0]);

    expect(chart).toContain("″grant_type″: ″authorization_code″");
    expect(chart).toContain("people ＆ contracts；read");
    expect(chart).not.toContain("&quot;");
    await expect(mermaid.parse(chart)).resolves.toBeTruthy();
  });
});
