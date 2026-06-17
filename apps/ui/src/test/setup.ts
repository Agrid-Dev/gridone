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
