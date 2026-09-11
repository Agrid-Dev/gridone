import type { Fluid } from "@gridone/sdk";

/**
 * Stroke and fill utilities per fluid a pipe carries. One `--fluid-*` token
 * per member of the backend `Fluid` vocabulary (index.css, tailwind.config.js).
 * Literal classes so Tailwind keeps them.
 */
export const FLUID_STROKE_CLASS: Record<Fluid, string> = {
  primary_supply: "stroke-fluid-primary-supply",
  primary_return: "stroke-fluid-primary-return",
  dhw: "stroke-fluid-dhw",
  dhw_loop: "stroke-fluid-dhw-loop",
  cold_water: "stroke-fluid-cold-water",
  heating_supply: "stroke-fluid-heating-supply",
  heating_return: "stroke-fluid-heating-return",
  chilled_supply: "stroke-fluid-chilled-supply",
  chilled_return: "stroke-fluid-chilled-return",
  condenser_supply: "stroke-fluid-condenser-supply",
  condenser_return: "stroke-fluid-condenser-return",
};

export const FLUID_FILL_CLASS: Record<Fluid, string> = {
  primary_supply: "fill-fluid-primary-supply",
  primary_return: "fill-fluid-primary-return",
  dhw: "fill-fluid-dhw",
  dhw_loop: "fill-fluid-dhw-loop",
  cold_water: "fill-fluid-cold-water",
  heating_supply: "fill-fluid-heating-supply",
  heating_return: "fill-fluid-heating-return",
  chilled_supply: "fill-fluid-chilled-supply",
  chilled_return: "fill-fluid-chilled-return",
  condenser_supply: "fill-fluid-condenser-supply",
  condenser_return: "fill-fluid-condenser-return",
};
