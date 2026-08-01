// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import mermaid from "mermaid";
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
              <line class="messageLine0" />
              <text class="messageText">request</text>
              <line class="messageLine0" />
              <text class="messageText">response</text>
              <line class="messageLine1" />
              <text class="messageText">complete</text>
              <line class="messageLine1" />
            </svg>`
          : '<svg viewBox="0 0 100 100"></svg>',
    })),
  },
}));

describe("Mermaid diagram interaction", () => {
  afterEach(cleanup);

  it("leaves ordinary scrolling native and reserves modified-wheel gestures for zoom", () => {
    const { container } = render(<MermaidView chart="sequenceDiagram" />);
    const viewport = container.querySelector(".mermaid-viewport");
    const scrollEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 30,
    });
    const zoomEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -30,
    });

    act(() => {
      viewport?.dispatchEvent(scrollEvent);
      viewport?.dispatchEvent(zoomEvent);
    });

    expect(scrollEvent.defaultPrevented).toBe(false);
    expect(zoomEvent.defaultPrevented).toBe(true);
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        sequence: expect.objectContaining({ mirrorActors: false }),
      }),
    );
  });

  it("keeps zoom independent from the explicit pan mode", () => {
    const { container } = render(<MermaidView chart="sequenceDiagram" />);

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("115%")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Enable pan mode" }));
    expect(screen.getByText("115%")).toBeTruthy();
    expect(container.querySelector(".mermaid-viewport")?.classList).toContain(
      "is-pan-enabled",
    );

    fireEvent.click(screen.getByRole("button", { name: "Use selection mode" }));
    expect(screen.getByText("115%")).toBeTruthy();
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

  it("selects messages and arrows while blank space clears the detail bubble", async () => {
    const onStepSelect = vi.fn();
    const onStepClear = vi.fn();
    const { container } = render(
      <MermaidView
        chart="interactive-sequence"
        interactiveStepIds={["exchange"]}
        messageStepIds={[null, "exchange", "exchange", null]}
        onStepSelect={onStepSelect}
        onStepClear={onStepClear}
        detailBubble={<div>Call details</div>}
      />,
    );

    await waitFor(() => {
      expect(container.querySelectorAll(".messageLine0, .messageLine1")).toHaveLength(4);
    });
    const messages = container.querySelectorAll<SVGElement>(".messageText");
    const arrows = container.querySelectorAll<SVGElement>(
      ".messageLine0, .messageLine1",
    );

    fireEvent.click(messages[1]);
    fireEvent.click(arrows[2]);
    expect(onStepSelect).toHaveBeenNthCalledWith(1, "exchange");
    expect(onStepSelect).toHaveBeenNthCalledWith(2, "exchange");

    fireEvent.click(screen.getByRole("button", { name: "Enable pan mode" }));
    fireEvent.click(messages[1]);
    expect(onStepSelect).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Use selection mode" }));

    fireEvent.click(container.querySelector(".mermaid-viewport")!);
    expect(onStepClear).toHaveBeenCalledOnce();
    expect(screen.getByText("Call details")).toBeTruthy();
  });
});
