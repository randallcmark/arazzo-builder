import { describe, expect, it } from "vitest";
import {
  buildCatalogue,
  operationReferenceParts,
  parseOpenApiSource,
} from "./openapi";

const openApiYaml = `
openapi: 3.1.0
info:
  title: Family Payments API
  version: 1.0.0
paths:
  /payments:
    post:
      operationId: createPayment
      summary: Create a payment
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
    });
    expect(catalogue.operations.map((operation) => operation.id)).toEqual([
      "createPayment",
      "getPayment",
    ]);
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
});
