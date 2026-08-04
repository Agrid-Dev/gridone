import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { useNow } from "../useNow";

function Probe() {
  const now = useNow();
  return <time data-testid="clock" dateTime={now.toISOString()} />;
}

function readClock(getByTestId: (id: string) => HTMLElement): string {
  return getByTestId("clock").getAttribute("dateTime") ?? "";
}

describe("useNow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T16:45:30.000Z"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("ticks on the minute boundary, not a flat 60s after mount", () => {
    const { getByTestId } = render(<Probe />);
    expect(readClock(getByTestId)).toBe("2026-07-21T16:45:30.000Z");

    // 30s in: one millisecond short of the boundary, still the old value.
    act(() => {
      vi.advanceTimersByTime(29_999);
    });
    expect(readClock(getByTestId)).toBe("2026-07-21T16:45:30.000Z");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(readClock(getByTestId)).toBe("2026-07-21T16:46:00.000Z");
  });

  it("reschedules a full minute after the first aligned tick", () => {
    const { getByTestId } = render(<Probe />);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(readClock(getByTestId)).toBe("2026-07-21T16:47:00.000Z");
  });

  it("resyncs when the tab becomes visible again", () => {
    const { getByTestId } = render(<Probe />);
    vi.setSystemTime(new Date("2026-07-21T17:12:00.000Z"));

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(readClock(getByTestId)).toBe("2026-07-21T17:12:00.000Z");
  });

  it("clears its timer on unmount", () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const { unmount } = render(<Probe />);
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
