import type { Severity } from "@/api/severity";

/**
 * Semantic colour tokens carrying BMS meaning (alert severity, connection
 * status, HVAC mode…). Each token is declared exactly once as a theme CSS
 * variable (`--status-*` / `--hvac-*` in index.css, registered in
 * tailwind.config.js). Both inline text and chart fills resolve from the same
 * token, so a given value is coloured identically everywhere it appears.
 */
export type SemanticColor =
  | "ok"
  | "info"
  | "warning"
  | "error"
  | "hvacHeat"
  | "hvacCool"
  | "hvacFan"
  | "hvacAuto";

/** The status slice of {@link SemanticColor} — used for severities and status. */
export type StatusLevel = Extract<
  SemanticColor,
  "ok" | "info" | "warning" | "error"
>;

/** CSS custom property backing each token (defined in index.css). */
const CSS_VAR: Record<SemanticColor, string> = {
  ok: "--status-ok",
  info: "--status-info",
  warning: "--status-warning",
  error: "--status-error",
  hvacHeat: "--hvac-heat",
  hvacCool: "--hvac-cool",
  hvacFan: "--hvac-fan",
  hvacAuto: "--hvac-auto",
};

/** Raw colour value for SVG / chart fills. */
export function semanticChartColor(color: SemanticColor): string {
  return `hsl(var(${CSS_VAR[color]}))`;
}

/** Inline text-colour utility per token. Literal classes so Tailwind keeps them. */
export const SEMANTIC_TEXT_CLASS: Record<SemanticColor, string> = {
  ok: "text-status-ok",
  info: "text-status-info",
  warning: "text-status-warning",
  error: "text-status-error",
  hvacHeat: "text-hvac-heat",
  hvacCool: "text-hvac-cool",
  hvacFan: "text-hvac-fan",
  hvacAuto: "text-hvac-auto",
};

/** Group-hover text-colour utility per token (literal classes for Tailwind). */
export const SEMANTIC_HOVER_TEXT_CLASS: Record<SemanticColor, string> = {
  ok: "group-hover:text-status-ok",
  info: "group-hover:text-status-info",
  warning: "group-hover:text-status-warning",
  error: "group-hover:text-status-error",
  hvacHeat: "group-hover:text-hvac-heat",
  hvacCool: "group-hover:text-hvac-cool",
  hvacFan: "group-hover:text-hvac-fan",
  hvacAuto: "group-hover:text-hvac-auto",
};

/** Solid fill utility per token (dots, indicators). */
export const SEMANTIC_BG_CLASS: Record<SemanticColor, string> = {
  ok: "bg-status-ok",
  info: "bg-status-info",
  warning: "bg-status-warning",
  error: "bg-status-error",
  hvacHeat: "bg-hvac-heat",
  hvacCool: "bg-hvac-cool",
  hvacFan: "bg-hvac-fan",
  hvacAuto: "bg-hvac-auto",
};

/** Fault severity mapped onto a semantic status level. */
export const SEVERITY_LEVEL: Record<Severity, StatusLevel> = {
  alert: "error",
  warning: "warning",
  info: "info",
};

/**
 * Registry mapping a stored attribute (snake_case, as used for chart series
 * keys and `DeviceAttribute.name`) and one of its values to a semantic colour.
 * A value with no entry falls back to the neutral chart palette. This is the
 * single source of truth for value→colour semantics across inline values,
 * status badges and chart panels.
 */
export const ATTRIBUTE_VALUE_COLORS: Record<
  string,
  Record<string, SemanticColor>
> = {
  mode: {
    heat: "hvacHeat",
    cool: "hvacCool",
    fan: "hvacFan",
    auto: "hvacAuto",
  },
  connection_status: {
    ok: "ok",
    degraded: "warning",
    error: "error",
    idle: "info",
  },
};

/** Semantic token for an attribute value, or undefined when none is registered. */
export function lookupSemanticColor(
  attributeName: string,
  value: string,
): SemanticColor | undefined {
  return ATTRIBUTE_VALUE_COLORS[attributeName]?.[value];
}

/** Chart-fill colour for an attribute value, or undefined to use the palette. */
export function attributeValueChartColor(
  attributeName: string,
  value: string,
): string | undefined {
  const color = lookupSemanticColor(attributeName, value);
  return color ? semanticChartColor(color) : undefined;
}
