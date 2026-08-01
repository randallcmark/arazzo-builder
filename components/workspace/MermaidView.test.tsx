// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MermaidView } from "./MermaidView";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (_id: string, chart: string) => ({
      svg:
        chart === "interactive-sequence"
          ? `<svg viewBox="0 0 100 100">
              <text class="messageText">start</text>
              <text class="messageText">request</text>
              <text class="messageText">response</text>
              <text class="messageText">complete</text>
            </svg>`
          : '<svg viewBox="0 0 100 100"></svg>',
    })),
  },
}));

describe("Mermaid diagram interaction", () => {
  afterEach(cleanup);

  it("uses a non-passive wheel listener inside the diagram viewport", () => {
    const { container } = render(<MermaidView chart="sequenceDiagram" />);
    const viewport = container.querySelector(".mermaid-viewport");
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 30,
    });

    act(() => {
      viewport?.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
  });

  it("keeps inferred boundary messages non-interactive", async () => {
    const { container } = render(
      <MermaidView
        chart="interactive-sequence"
        interactiveStepIds={["exchange"]}
        messageStepIds={[null, "exchange", "exchange", null]}
      />,
    );

    await waitFor(() => {
      expect(container.querySelectorAll(".messageText")).toHaveLength(4);
    });
    const messages = container.querySelectorAll<SVGElement>(".messageText");
    expect(messages[0].dataset.stepId).toBeUndefined();
    expect(messages[1].dataset.stepId).toBe("exchange");
    expect(messages[2].dataset.stepId).toBe("exchange");
    expect(messages[3].dataset.stepId).toBeUndefined();
  });
});
