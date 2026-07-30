// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiSourceDialog } from "./ApiSourceDialog";

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open API dialog</button>
      <ApiSourceDialog
        open={open}
        catalogues={[]}
        onClose={() => setOpen(false)}
        onAddUrl={vi.fn()}
        onAddFile={vi.fn()}
      />
    </>
  );
}

describe("API source dialog accessibility", () => {
  afterEach(cleanup);

  it("moves focus into the dialog, closes on Escape, and restores focus", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const opener = screen.getByRole("button", { name: "Open API dialog" });

    await user.click(opener);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Close dialog" }),
    );

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
