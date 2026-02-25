/**
 * Shared mock factory for @react-spring/web.
 *
 * react-spring's string interpolator crashes in jsdom because it tries
 * to parse CSS color values using getComputedStyle which doesn't work for SVG.
 * This module provides passthrough animated elements and inert spring hooks.
 */
import { createElement, forwardRef } from "react";

/** Wraps a plain value so it supports the `.to()` / `.get()` API that
 *  react-spring consumers (like visx AnimatedPath) rely on. */
function mockVal(v: unknown): unknown {
  return {
    get: () => v,
    to: (fn: unknown) => (typeof fn === "function" ? fn(v) : v),
    interpolate: (fn: unknown) => (typeof fn === "function" ? fn(v) : v),
  };
}

const SPRING_KEYS = new Set([
  "from",
  "to",
  "reset",
  "delay",
  "config",
  "immediate",
  "ref",
  "reverse",
  "cancel",
  "pause",
  "onStart",
  "onRest",
  "onChange",
  "onProps",
  "default",
]);

function toSpringResult(config: Record<string, unknown>) {
  const target =
    config.to && typeof config.to === "object"
      ? (config.to as Record<string, unknown>)
      : config;
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(target)) {
    if (!SPRING_KEYS.has(key)) result[key] = mockVal(val);
  }
  return result;
}

/** Proxy that turns `animated.path`, `animated.div`, etc. into passthrough
 *  forwardRef components that unwrap any mockVal props. */
const animated = new Proxy(
  {},
  {
    get(_, tag: string) {
      const Comp = forwardRef<unknown, Record<string, unknown>>(
        (props, ref) => {
          const clean: Record<string, unknown> = {};
          for (const [key, val] of Object.entries(props)) {
            if (
              val &&
              typeof val === "object" &&
              "get" in (val as Record<string, unknown>) &&
              typeof (val as Record<string, () => unknown>).get === "function"
            ) {
              clean[key] = (val as { get: () => unknown }).get();
            } else {
              clean[key] = val;
            }
          }
          return createElement(tag, { ...clean, ref });
        },
      );
      Comp.displayName = `animated.${tag}`;
      return Comp;
    },
  },
);

export function useSpring(config: unknown) {
  const resolved = typeof config === "function" ? config() : config;
  return toSpringResult(resolved as Record<string, unknown>);
}

export function useSprings(n: number, fn: unknown) {
  const items = Array.from({ length: n }, (_, i) => {
    const cfg = typeof fn === "function" ? fn(i) : fn;
    return toSpringResult(cfg as Record<string, unknown>);
  });
  return [items, () => {}];
}

export function useTransition() {
  return [];
}

export function useChain() {}

export const config = {
  default: {},
  gentle: {},
  wobbly: {},
  stiff: {},
  slow: {},
  molasses: {},
};

export const Globals = { assign: () => {} };

export { animated };
