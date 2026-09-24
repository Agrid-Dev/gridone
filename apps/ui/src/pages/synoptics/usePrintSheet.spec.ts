import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { usePrintSheet } from "./usePrintSheet";

/** What the browser does around its print dialog, whatever opened it. */
const beforeprint = () =>
  act(() => {
    window.dispatchEvent(new Event("beforeprint"));
  });
const afterprint = () =>
  act(() => {
    window.dispatchEvent(new Event("afterprint"));
  });
const dark = () => document.documentElement.classList.contains("dark");

type ActGlobal = { IS_REACT_ACT_ENVIRONMENT?: boolean };

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
});

describe("usePrintSheet", () => {
  it("remembers the page was dark through a second beforeprint before the afterprint", () => {
    document.documentElement.classList.add("dark");
    renderHook(() => usePrintSheet());
    beforeprint();
    beforeprint();
    expect(dark()).toBe(false);
    afterprint();
    expect(dark()).toBe(true);
  });

  it("reads false until the browser starts printing, true while it prints, and false once it is done", () => {
    const { result } = renderHook(() => usePrintSheet());
    expect(result.current).toBe(false);

    beforeprint();
    expect(result.current).toBe(true);

    afterprint();
    expect(result.current).toBe(false);

    // A second print goes through the same way.
    beforeprint();
    expect(result.current).toBe(true);
    afterprint();
    expect(result.current).toBe(false);
  });

  it("lifts the dark theme for the print and puts it back afterwards", () => {
    document.documentElement.classList.add("dark");
    renderHook(() => usePrintSheet());
    expect(dark()).toBe(true);

    beforeprint();
    expect(dark()).toBe(false);

    afterprint();
    expect(dark()).toBe(true);
  });

  it("never darkens a page that was light before the print", () => {
    renderHook(() => usePrintSheet());
    beforeprint();
    expect(dark()).toBe(false);
    afterprint();
    expect(dark()).toBe(false);
  });

  it("puts the dark theme back when the page goes away in the middle of a print", () => {
    document.documentElement.classList.add("dark");
    const { unmount } = renderHook(() => usePrintSheet());
    beforeprint();
    expect(dark()).toBe(false);

    unmount();
    expect(dark()).toBe(true);
  });

  it("leaves a light page light when it goes away in the middle of a print", () => {
    const { unmount } = renderHook(() => usePrintSheet());
    beforeprint();
    unmount();
    expect(dark()).toBe(false);
  });

  it("does not put the dark theme back twice: once restored after the print, an unmount leaves the theme alone", () => {
    document.documentElement.classList.add("dark");
    const { unmount } = renderHook(() => usePrintSheet());
    beforeprint();
    afterprint();
    // The operator switches to the light theme after printing.
    document.documentElement.classList.remove("dark");
    unmount();
    expect(dark()).toBe(false);
  });

  it("stops listening once the page is gone: a later print leaves the theme alone", () => {
    document.documentElement.classList.add("dark");
    const { unmount } = renderHook(() => usePrintSheet());
    unmount();

    window.dispatchEvent(new Event("beforeprint"));
    expect(dark()).toBe(true);
    window.dispatchEvent(new Event("afterprint"));
    expect(dark()).toBe(true);
  });

  it("commits the flag inside the browser's event, before the page is laid out for paper", () => {
    // As in a browser: no act() around the event, so an update React would
    // only schedule is not on the page yet when the handler returns.
    const { result } = renderHook(() => usePrintSheet());
    const scope = globalThis as ActGlobal;
    const previous = scope.IS_REACT_ACT_ENVIRONMENT;
    scope.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      window.dispatchEvent(new Event("beforeprint"));
      expect(result.current).toBe(true);
    } finally {
      scope.IS_REACT_ACT_ENVIRONMENT = previous;
      afterprint();
    }
  });
});
