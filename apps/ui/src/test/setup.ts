/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
import "@testing-library/jest-dom/vitest";

// ---------------------------------------------------------------------------
// Patch @react-spring for jsdom.
//
// react-spring's createStringInterpolator2 crashes in jsdom because
// String.match(numberRegex) returns null for empty/unsupported SVG values.
//
// Strategy: force-load @react-spring/web (which registers the broken
// interpolator during module init), then immediately overwrite it with
// a safe no-op version via Globals.assign.
// ---------------------------------------------------------------------------
require("@react-spring/web");

const shared = require("@react-spring/shared");
shared.Globals.assign({
  skipAnimation: true,
  createStringInterpolator: (config: { output: string[] }) => {
    const last = config.output[config.output.length - 1];
    return () => last;
  },
});

// ---------------------------------------------------------------------------
// ResizeObserver stub for visx ParentSize / XYChart
// ---------------------------------------------------------------------------
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

window.ResizeObserver ??=
  ResizeObserverStub as unknown as typeof ResizeObserver;

// ---------------------------------------------------------------------------
// IntersectionObserver stub — jsdom does not implement it, and the fleet grid
// gates its per-card history fetch on visibility (useInViewOnce).
//
// It observes without ever reporting an intersection, so nothing off-screen
// fetches by accident. A spec that needs the visible path installs its own
// firing stub with `vi.stubGlobal`.
// ---------------------------------------------------------------------------
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

window.IntersectionObserver ??=
  IntersectionObserverStub as unknown as typeof IntersectionObserver;

// ---------------------------------------------------------------------------
// Pointer capture stubs — jsdom implements no pointer capture at all, so any
// drag interaction (thermostat dial, Radix pointer-based primitives) throws on
// the first pointerdown.
// ---------------------------------------------------------------------------
Element.prototype.setPointerCapture ??= function setPointerCapture() {};
Element.prototype.releasePointerCapture ??= function releasePointerCapture() {};
Element.prototype.hasPointerCapture ??= function hasPointerCapture() {
  return false;
};

// ---------------------------------------------------------------------------
// scrollIntoView stub — jsdom does not implement it, and cmdk calls it when it
// auto-selects an item (command palette, resource pickers).
// ---------------------------------------------------------------------------
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
