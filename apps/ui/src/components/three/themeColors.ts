/**
 * Resolves the app's semantic CSS tokens into concrete colors for three.js
 * materials — `THREE.Color` cannot parse `hsl(var(--x))`, so the bare HSL
 * triplets are read from the document root and re-read on theme changes
 * (the ThemeProvider toggles the `dark` class on <html>).
 */
import { useEffect, useState } from "react";
import type { ConnectionStatus } from "@/lib/devices";
import type { Severity } from "@/lib/severity";
import {
  parseHslTriplet,
  temperatureHsl,
  type HslTriplet,
} from "./temperature";

/** What the space volumes (and panel dots) are coloured by. */
export type ColorMode = "temperature" | "function" | "alerts" | "connectivity";

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
    envelope: string;
    /** Distance haze — matched to the CSS sky gradient behind the canvas. */
    fog: string;
  };
};

const LIGHT_STAGE = {
  gridCell: "#e7ded6",
  gridSection: "#d2c3b6",
  slab: "#b0a094",
  structure: "#8b7777",
  envelope: "#9fadbd",
  fog: "#e9dfd5",
};

const DARK_STAGE = {
  gridCell: "#2a2320",
  gridSection: "#3d322c",
  slab: "#241d1a",
  structure: "#d8a48c",
  envelope: "#41597a",
  fog: "#221b17",
};

const FALLBACKS = {
  "--hvac-cool": [217, 91, 60],
  "--status-ok": [142, 76, 36],
  "--hvac-heat": [25, 95, 53],
  "--status-error": [0, 72, 51],
} as const satisfies Record<string, HslTriplet>;

function readToken(
  styles: CSSStyleDeclaration,
  token: keyof typeof FALLBACKS,
): HslTriplet {
  return parseHslTriplet(styles.getPropertyValue(token)) ?? FALLBACKS[token];
}

function resolveViewerTheme(): ViewerTheme {
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

/**
 * Warm grey glass of rooms without live data. Kept deliberately desaturated
 * so it never competes with the saturated comfort and alert colours.
 */
export const NEUTRAL_SPACE: HslTriplet = [10, 14, 62];

/** State a zone can be coloured from, across every mode. */
type ZoneColorInput = {
  temperature: number | null;
  severity: Severity | null;
  objectType?: string | null;
  connection?: ConnectionStatus | null;
};

/** Function families the "function" colour mode groups rooms into. */
export type FunctionKey =
  | "room"
  | "technical"
  | "restaurant"
  | "reception"
  | "office"
  | "meeting"
  | "workspace"
  | "wellness"
  | "sanitary"
  | "circulation"
  | "outdoor";

/**
 * Categorical palette for the "function" mode, matched by keyword against the
 * free-text IFC classification (``object_type``). Fixed hues — they read on
 * translucent glass in either theme — ordered most-specific keyword first.
 */
const FUNCTION_FAMILIES: {
  key: FunctionKey;
  match: string[];
  color: HslTriplet;
}[] = [
  { key: "room", match: ["chambre"], color: [222, 60, 62] },
  {
    // Short tokens like "pac"/"cta" are avoided — "pac" hides inside "espace".
    key: "technical",
    match: [
      "technique",
      "technical",
      "gaine",
      "chaufferie",
      "chaleur",
      "traitement d'air",
      "ventilation",
      "extraction",
    ],
    color: [275, 45, 62],
  },
  {
    key: "restaurant",
    match: ["restaur", "cuisine", "bar"],
    color: [12, 68, 60],
  },
  {
    key: "reception",
    match: ["accueil", "lobby", "réception", "reception"],
    color: [168, 52, 52],
  },
  { key: "office", match: ["bureau", "office", "admin"], color: [140, 45, 52] },
  {
    key: "meeting",
    match: ["réunion", "reunion", "salon", "séminaire"],
    color: [318, 45, 60],
  },
  {
    key: "workspace",
    match: ["travail", "coworking", "co-working", "club", "lounge"],
    color: [190, 55, 55],
  },
  {
    key: "wellness",
    match: ["sauna", "forme", "fitness", "bien"],
    color: [335, 55, 66],
  },
  { key: "sanitary", match: ["sanitaire", "wc"], color: [205, 45, 66] },
  {
    key: "circulation",
    match: ["circulation", "noyau", "escalier", "palier"],
    color: [200, 22, 60],
  },
  {
    key: "outdoor",
    match: ["terrasse", "extérieur", "vide"],
    color: [95, 45, 58],
  },
];

/** Family a classification falls into, or null when no keyword matches. */
function matchFamily(
  objectType: string | null | undefined,
): (typeof FUNCTION_FAMILIES)[number] | null {
  if (!objectType) {
    return null;
  }
  const text = objectType.toLowerCase();
  return (
    FUNCTION_FAMILIES.find((family) =>
      family.match.some((keyword) => text.includes(keyword)),
    ) ?? null
  );
}

/** Family key of a classification, or null when unrecognised. */
export function functionKeyOf(
  objectType: string | null | undefined,
): FunctionKey | null {
  return matchFamily(objectType)?.key ?? null;
}

/** Colour of a room from its classification, or neutral when unrecognised. */
function functionTriplet(objectType: string | null | undefined): HslTriplet {
  return matchFamily(objectType)?.color ?? NEUTRAL_SPACE;
}

/** The distinct function families, in display order, for the legend. */
export const FUNCTION_LEGEND: { key: FunctionKey; color: HslTriplet }[] =
  FUNCTION_FAMILIES.map((family) => ({ key: family.key, color: family.color }));

/**
 * Colour of a zone under the active colour mode. Shared by the 3D volumes, the
 * levels panel, the room panel and the device markers so they never disagree.
 * Each mode shows exactly its dimension — active alerts stay legible in every
 * mode through the pulse the frame loop applies, not through the colour.
 */
export function zoneTriplet(
  zone: ZoneColorInput | undefined,
  theme: ViewerTheme,
  mode: ColorMode,
): HslTriplet {
  if (!zone) {
    return NEUTRAL_SPACE;
  }
  switch (mode) {
    case "function":
      return functionTriplet(zone.objectType);
    case "alerts":
      if (zone.severity === "alert") return theme.error;
      if (zone.severity === "warning") return theme.heat;
      return NEUTRAL_SPACE;
    case "connectivity":
      if (zone.connection === "ok") return theme.ok;
      if (zone.connection === "degraded") return theme.heat;
      if (zone.connection === "error") return theme.error;
      return NEUTRAL_SPACE;
    case "temperature":
      return zone.temperature != null
        ? temperatureHsl(zone.temperature, theme.cool, theme.ok, theme.heat)
        : NEUTRAL_SPACE;
  }
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
