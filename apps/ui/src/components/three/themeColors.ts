/**
 * Resolves the app's semantic CSS tokens into concrete colors for three.js
 * materials — `THREE.Color` cannot parse `hsl(var(--x))`, so the bare HSL
 * triplets are read from the document root and re-read on theme changes
 * (the ThemeProvider toggles the `dark` class on <html>).
 *
 * The scene itself is a fixed dark stage (demo look); only the semantic
 * accents (temperature gradient, alerts) follow the app theme.
 */
import { useEffect, useState } from "react";
import { parseHslTriplet, type HslTriplet } from "./temperature";

export type ViewerTheme = {
  isDark: boolean;
  cool: HslTriplet;
  ok: HslTriplet;
  heat: HslTriplet;
  error: HslTriplet;
  /** Stage colors of the scene backdrop elements, per app theme. */
  stage: {
    gridCell: string;
    gridSection: string;
    slab: string;
    structure: string;
  };
};

const LIGHT_STAGE = {
  gridCell: "#e2e7f2",
  gridSection: "#c9d2e6",
  slab: "#98a3be",
  structure: "#6c8db0",
};

const DARK_STAGE = {
  gridCell: "#1c2545",
  gridSection: "#2c3a6b",
  slab: "#141b33",
  structure: "#9fd8ff",
};

const FALLBACKS: Record<string, HslTriplet> = {
  "--hvac-cool": [217, 91, 60],
  "--status-ok": [142, 76, 36],
  "--hvac-heat": [25, 95, 53],
  "--status-error": [0, 72, 51],
};

function readToken(styles: CSSStyleDeclaration, token: string): HslTriplet {
  return (
    parseHslTriplet(styles.getPropertyValue(token)) ??
    FALLBACKS[token] ?? [0, 0, 50]
  );
}

export function resolveViewerTheme(): ViewerTheme {
  const rootElement = document.documentElement;
  const styles = getComputedStyle(rootElement);
  const isDark = rootElement.classList.contains("dark");
  return {
    isDark,
    cool: readToken(styles, "--hvac-cool"),
    ok: readToken(styles, "--status-ok"),
    heat: readToken(styles, "--hvac-heat"),
    error: readToken(styles, "--status-error"),
    stage: isDark ? DARK_STAGE : LIGHT_STAGE,
  };
}

/** Current viewer palette, re-resolved whenever the root theme class flips. */
export function useViewerTheme(): ViewerTheme {
  const [theme, setTheme] = useState<ViewerTheme>(resolveViewerTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(resolveViewerTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);
  return theme;
}
