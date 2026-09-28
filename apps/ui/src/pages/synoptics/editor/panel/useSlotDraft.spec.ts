import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SlotValue } from "@gridone/sdk";
import { useDocumentHistory } from "../useDocumentHistory";
import { useSlotDraft } from "./useSlotDraft";

const original: SlotValue = {
  kind: "attribute",
  target: { devices: { ids: ["own"] }, attribute: "temperature" },
  unit: "°C",
  decimals: 1,
};

describe("binding drafts", () => {
  it("saves the previous binding until complete, then replaces it in one undo step", () => {
    const { result } = renderHook(() => {
      const history = useDocumentHistory<SlotValue | undefined>(original);
      const draft = useSlotDraft(history.doc, "own", (value) =>
        history.apply(() => value),
      );
      return { history, draft };
    });
    act(() => result.current.draft.start());
    act(() => result.current.draft.pick({ devices: { ids: ["other"] } }));
    expect(JSON.parse(JSON.stringify(result.current.history.doc))).toEqual(
      original,
    );
    expect(result.current.history.canUndo).toBe(false);
    act(() =>
      result.current.draft.pick({
        devices: { ids: ["other"] },
        attribute: " ",
      }),
    );
    expect(result.current.history.doc).toBe(original);
    const target = { devices: { ids: ["other"] }, attribute: "flow" };
    act(() => result.current.draft.pick(target));
    expect(result.current.history.doc).toEqual({ ...original, target });
    expect(result.current.draft.target).toBeNull();
    act(() => result.current.draft.start());
    act(() => result.current.history.undo());
    expect(result.current.history.doc).toBe(original);
    expect(result.current.draft.target).toBeNull();
    expect(result.current.history.canUndo).toBe(false);
    act(() => result.current.history.redo());
    expect(result.current.history.doc).toEqual({ ...original, target });
    expect(result.current.draft.target).toBeNull();
  });

  it("discards a pending target when its binding or device changes, even if restored later", () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ value, device }) => useSlotDraft(value, device, onChange),
      { initialProps: { value: original as SlotValue, device: "own" } },
    );
    act(() => result.current.start());
    rerender({ value: original, device: "new" });
    expect(result.current.target).toBeNull();
    rerender({ value: original, device: "own" });
    expect(result.current.target).toBeNull();
    act(() => result.current.start());
    rerender({ value: { kind: "text", text: "55" }, device: "own" });
    expect(result.current.target).toBeNull();
    rerender({ value: original, device: "own" });
    expect(result.current.target).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
