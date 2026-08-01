// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ArazzoWorkflow } from "@/lib/arazzo";
import { DocumentationView } from "./DocumentationView";

describe("workflow documentation", () => {
  afterEach(cleanup);

  it("presents each input name and type separately from its description", () => {
    const workflow: ArazzoWorkflow = {
      workflowId: "authorize",
      inputs: {
        properties: {
          redirect_uri: {
            type: "string",
            format: "uri",
            description: "The callback URI registered for the application.",
          },
        },
        required: ["redirect_uri"],
      },
      steps: [],
    };

    render(<DocumentationView workflow={workflow} sources={[]} />);

    expect(screen.getByText("redirect_uri")).toBeTruthy();
    expect(screen.getByText("(string · uri)")).toBeTruthy();
    expect(screen.getByText("required")).toBeTruthy();
    expect(
      screen.getByText("The callback URI registered for the application."),
    ).toBeTruthy();
  });
});
