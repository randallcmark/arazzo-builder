// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MermaidView } from "./MermaidView";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({
      svg: '<svg viewBox="0 0 100 100"></svg>',
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
});
