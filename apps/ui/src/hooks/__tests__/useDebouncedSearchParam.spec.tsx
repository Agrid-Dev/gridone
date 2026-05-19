import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router";
import type { ReactNode } from "react";
import { useDebouncedSearchParam } from "../useDebouncedSearchParam";

const DELAY = 300;

function wrapperFactory(initialEntries: string[] = ["/"]) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    );
  };
}

describe("useDebouncedSearchParam", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the initial value from the URL", () => {
    const { result } = renderHook(
      () => useDebouncedSearchParam("search", DELAY),
      { wrapper: wrapperFactory(["/devices?search=chambre"]) },
    );
    expect(result.current.value).toBe("chambre");
  });

  it("updates local value immediately but defers the URL update", () => {
    const probe = vi.fn();
    function Probe() {
      const [params] = useSearchParams();
      probe(params.get("search"));
      return null;
    }
    const { result } = renderHook(
      () => {
        const hook = useDebouncedSearchParam("search", DELAY);
        return hook;
      },
      {
        wrapper: ({ children }) => (
          <MemoryRouter initialEntries={["/devices"]}>
            {children}
            <Probe />
          </MemoryRouter>
        ),
      },
    );

    act(() => {
      result.current.setValue("ch");
    });
    expect(result.current.value).toBe("ch");
    // Still no URL write before debounce window elapses.
    expect(probe).toHaveBeenLastCalledWith(null);

    act(() => {
      vi.advanceTimersByTime(DELAY);
    });
    expect(probe).toHaveBeenLastCalledWith("ch");
  });

  it("coalesces rapid edits into a single URL write", () => {
    const probe = vi.fn();
    function Probe() {
      const [params] = useSearchParams();
      probe(params.get("search"));
      return null;
    }
    const { result } = renderHook(
      () => useDebouncedSearchParam("search", DELAY),
      {
        wrapper: ({ children }) => (
          <MemoryRouter initialEntries={["/devices"]}>
            {children}
            <Probe />
          </MemoryRouter>
        ),
      },
    );
    probe.mockClear();

    act(() => {
      result.current.setValue("c");
    });
    act(() => {
      vi.advanceTimersByTime(100);
      result.current.setValue("ch");
    });
    act(() => {
      vi.advanceTimersByTime(100);
      result.current.setValue("cha");
    });

    // The URL still has not been written yet — every keystroke restarted the
    // debounce window.
    expect(probe).not.toHaveBeenCalledWith("c");
    expect(probe).not.toHaveBeenCalledWith("ch");

    act(() => {
      vi.advanceTimersByTime(DELAY);
    });
    expect(probe).toHaveBeenLastCalledWith("cha");
  });

  it("clear() resets local value and removes the URL param immediately", () => {
    const probe = vi.fn();
    function Probe() {
      const [params] = useSearchParams();
      probe(params.get("search"));
      return null;
    }
    const { result } = renderHook(
      () => useDebouncedSearchParam("search", DELAY),
      {
        wrapper: ({ children }) => (
          <MemoryRouter initialEntries={["/devices?search=chambre"]}>
            {children}
            <Probe />
          </MemoryRouter>
        ),
      },
    );

    expect(result.current.value).toBe("chambre");

    act(() => {
      result.current.clear();
    });

    expect(result.current.value).toBe("");
    expect(probe).toHaveBeenLastCalledWith(null);
  });
});
