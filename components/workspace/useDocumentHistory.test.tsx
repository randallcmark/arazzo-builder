// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useDocumentHistory } from "./useDocumentHistory";

describe("document history", () => {
  afterEach(cleanup);

  it("undoes and redoes exact source snapshots", () => {
    const { result } = renderHook(() => useDocumentHistory());

    act(() => result.current.resetSource("arazzo: 1.0.1\n# baseline\n"));
    act(() => result.current.replaceSource("arazzo: 1.0.1\n# changed\n"));

    expect(result.current.canUndo).toBe(true);
    act(() => {
      expect(result.current.undo()).toBe(true);
    });
    expect(result.current.source).toBe("arazzo: 1.0.1\n# baseline\n");

    act(() => {
      expect(result.current.redo()).toBe(true);
    });
    expect(result.current.source).toBe("arazzo: 1.0.1\n# changed\n");
  });
});
