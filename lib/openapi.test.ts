import { describe, expect, it } from "vitest";
import {
  buildCatalogue,
  canAutoLoadOpenApiReference,
  operationReferenceParts,
  parseOpenApiSource,
  resolveStepOperation,
} from "./openapi";

const openApiYaml = `
openapi: 3.1.0
info:
  title: Family Payments API
  version: 1.0.0
servers:
  - url: https://api.family.example/v1
security:
  - bearerAuth: []
paths:
  /payments:
    parameters:
      - name: trace_id
        in: header
        required: false
        schema:
          type: string
    post:
      operationId: createPayment
      summary: Create a payment
      description: Creates and schedules a family payment.
      tags: [Payments]
      parameters:
        - name: dry_run
          in: query
          required: false
          schema:
            type: boolean
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Payment'
      responses:
        '201':
          description: Payment created
          content:
            application/json: {}
        '400':
          description: Invalid payment
  /payments/{paymentId}:
    get:
      operationId: getPayment
      summary: Get a payment
`;

describe("OpenAPI catalogues", () => {
  it("parses YAML and enumerates source-qualified operations", () => {
    const document = parseOpenApiSource(openApiYaml);
    const catalogue = buildCatalogue(
      document,
      "payments",
      "./payments.openapi.yaml",
    );

    expect(catalogue.title).toBe("Family Payments API");
    expect(catalogue.operations).toHaveLength(2);
    expect(catalogue.operations[0]).toMatchObject({
      sourceName: "payments",
      sourceTitle: "Family Payments API",
      resolved: true,
    });
    expect(catalogue.operations.map((operation) => operation.id)).toEqual([
      "createPayment",
      "getPayment",
    ]);
    expect(catalogue.operations[0]).toMatchObject({
      description: "Creates and schedules a family payment.",
      tags: ["Payments"],
      parameters: [
        {
          name: "trace_id",
          location: "header",
          required: false,
          schema: "string",
        },
        {
          name: "dry_run",
          location: "query",
          required: false,
          schema: "boolean",
        },
      ],
      requestBody: {
        required: true,
        contentTypes: ["application/json"],
      },
      responses: [
        {
          status: "201",
          description: "Payment created",
          contentTypes: ["application/json"],
        },
        {
          status: "400",
          description: "Invalid payment",
          contentTypes: [],
        },
      ],
      security: ["bearerAuth"],
      servers: ["https://api.family.example/v1"],
    });
  });

  it("parses an Arazzo operation reference", () => {
    expect(
      operationReferenceParts(
        "$sourceDescriptions.payments.createPayment",
      ),
    ).toEqual({
      sourceName: "payments",
      operationId: "createPayment",
    });
    expect(operationReferenceParts("$steps.create.outputs.id")).toBeNull();
  });

  it("resolves an official-style Arazzo operationPath JSON pointer", () => {
    const catalogue = buildCatalogue(
      parseOpenApiSource(openApiYaml),
      "payments",
      "./payments.openapi.yaml",
    );

    expect(
      resolveStepOperation(
        undefined,
        "{$sourceDescriptions.payments.url}#/paths/~1payments/post",
        [catalogue],
      )?.operation,
    ).toMatchObject({ id: "createPayment", method: "POST", path: "/payments" });
  });

  it("resolves an unqualified operationId when it is unambiguous", () => {
    const catalogue = buildCatalogue(
      parseOpenApiSource(openApiYaml),
      "payments",
      "./payments.openapi.yaml",
    );

    expect(
      resolveStepOperation("createPayment", undefined, [catalogue]),
    ).toMatchObject({
      catalogue: { sourceName: "payments" },
      operation: { id: "createPayment", method: "POST" },
    });
  });

  it("auto-loads only relative or same-origin OpenAPI references", () => {
    const pageUrl = "https://builder.example/workspace";

    expect(canAutoLoadOpenApiReference("/openapi.json", pageUrl)).toBe(true);
    expect(
      canAutoLoadOpenApiReference(
        "https://builder.example/specs/payments.yaml",
        pageUrl,
      ),
    ).toBe(true);
    expect(
      canAutoLoadOpenApiReference("https://api.example/openapi.json", pageUrl),
    ).toBe(false);
    expect(
      canAutoLoadOpenApiReference("http://127.0.0.1:8080/openapi.json", pageUrl),
    ).toBe(false);
    expect(canAutoLoadOpenApiReference("http://[", pageUrl)).toBe(false);
  });
});
