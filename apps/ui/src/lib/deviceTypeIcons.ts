import { createLucideIcon } from "lucide-react";

/**
 * Pictograms of the standard device types, drawn for the fleet UI as one
 * family: Lucide's grammar (24-unit grid, round caps and joins, stroke in
 * `currentColor`) so they sit beside Lucide icons, but each type gets its own
 * machine — Lucide has no heat pump, air handler or pump, and one `AirVent`
 * for both air handlers said nothing.
 *
 * Built with `createLucideIcon`, so they take the same props as any Lucide
 * icon (`className`, `size`, `strokeWidth`…). The type → icon mapping lives
 * in `deviceTypes.ts`.
 */

/** Thermometer with its scale: tube and bulb in one outline, the column. */
export const ThermostatIcon = createLucideIcon("gridone-thermostat", [
  ["path", { d: "M10 4.5a2 2 0 0 1 4 0v9.2a4.2 4.2 0 1 1-4 0Z", key: "tube" }],
  ["path", { d: "M12 10v6", key: "column" }],
  [
    "circle",
    { cx: "12", cy: "17", r: "1.4", fill: "currentColor", key: "bulb" },
  ],
  ["path", { d: "M16.5 6.5h2M16.5 9.5h2M16.5 12.5h1.5", key: "scale" }],
]);

/** Air/water heat pump: the outdoor unit — fan grille, louvres, feet. */
export const HeatPumpIcon = createLucideIcon("gridone-heat-pump", [
  [
    "rect",
    { x: "3", y: "5", width: "18", height: "12.5", rx: "2", key: "casing" },
  ],
  ["circle", { cx: "9", cy: "11.25", r: "3.4", key: "grille" }],
  [
    "path",
    { d: "M9 9.2v4.1M7.2 10.2l3.6 2.1M7.2 12.3l3.6-2.1", key: "blades" },
  ],
  ["path", { d: "M15 8.5h3M15 11.25h3M15 14h3", key: "louvres" }],
  ["path", { d: "M6 17.5V20M18 17.5V20", key: "feet" }],
]);

/** Single-flow air handler: one duct line — fan, then the coil. */
export const AirHandlerSingleFlowIcon = createLucideIcon(
  "gridone-air-handler-single-flow",
  [
    [
      "rect",
      {
        x: "2.5",
        y: "6.5",
        width: "19",
        height: "11",
        rx: "1.5",
        key: "casing",
      },
    ],
    ["circle", { cx: "8", cy: "12", r: "3", key: "fan" }],
    ["path", { d: "M8 10.3v3.4", key: "hub" }],
    ["path", { d: "M13.5 8.5v7M16 8.5v7M18.5 8.5v7", key: "coil" }],
  ],
);

/** Double-flow air handler: two stacked duct lines, air in opposite ways. */
export const AirHandlerDoubleFlowIcon = createLucideIcon(
  "gridone-air-handler-double-flow",
  [
    [
      "rect",
      {
        x: "2.5",
        y: "4.5",
        width: "19",
        height: "15",
        rx: "1.5",
        key: "casing",
      },
    ],
    ["path", { d: "M2.5 12h19", key: "split" }],
    ["path", { d: "M6.5 8.25h9M13.5 6.5l2 1.75-2 1.75", key: "supply" }],
    ["path", { d: "M17.5 15.75h-9M10.5 14l-2 1.75 2 1.75", key: "extract" }],
  ],
);

/** Air extractor: three blades in a round shroud. */
export const AirExtractorIcon = createLucideIcon("gridone-air-extractor", [
  ["circle", { cx: "12", cy: "12", r: "8.5", key: "shroud" }],
  ["circle", { cx: "12", cy: "12", r: "1.3", key: "hub" }],
  ["path", { d: "M12 10.7c-.4-2.6.6-4.4 3-5", key: "blade-1" }],
  ["path", { d: "M13.1 12.7c2.5.9 3.6 2.6 3 5", key: "blade-2" }],
  ["path", { d: "M10.9 12.6c-2 1.7-4 1.8-5.6.1", key: "blade-3" }],
]);

/** Pump, as on a P&ID: volute, tangential outlet, flow triangle, base. */
export const PumpIcon = createLucideIcon("gridone-pump", [
  ["circle", { cx: "10", cy: "13", r: "6.5", key: "volute" }],
  ["path", { d: "M10 6.5h10v4h-3.5", key: "outlet" }],
  ["path", { d: "M8 10.2l5 2.8-5 2.8Z", key: "flow" }],
  ["path", { d: "M5 21h10", key: "base" }],
]);

/** Electricity meter: the cabinet, its register window and a bolt. */
export const ElectricityMeterIcon = createLucideIcon(
  "gridone-electricity-meter",
  [
    [
      "rect",
      { x: "4.5", y: "3", width: "15", height: "18", rx: "2", key: "cabinet" },
    ],
    [
      "rect",
      { x: "7.5", y: "6", width: "9", height: "4", rx: ".8", key: "register" },
    ],
    ["path", { d: "M12.8 12.5l-2.3 3.2h3l-2.3 3.2", key: "bolt" }],
  ],
);

/** Leak detector: a drop, with its highlight. */
export const LiquidDetectorIcon = createLucideIcon("gridone-liquid-detector", [
  [
    "path",
    {
      d: "M12 3.5c3 3.6 5.5 6.5 5.5 9.8a5.5 5.5 0 0 1-11 0c0-3.3 2.5-6.2 5.5-9.8Z",
      key: "drop",
    },
  ],
  ["path", { d: "M9.5 14.2a2.6 2.6 0 0 0 2.2 2.4", key: "highlight" }],
]);

/** Weather sensor: sun behind a cloud. */
export const WeatherSensorIcon = createLucideIcon("gridone-weather-sensor", [
  ["circle", { cx: "8", cy: "8", r: "2.8", key: "sun" }],
  ["path", { d: "M8 2.5v1M2.5 8h1M4.1 4.1l.7.7M11.9 4.1l-.7.7", key: "rays" }],
  [
    "path",
    {
      d: "M8.5 19.5h9a3.3 3.3 0 0 0 .2-6.6 5 5 0 0 0-9.4 1.4 2.6 2.6 0 0 0 .2 5.2Z",
      key: "cloud",
    },
  ],
]);

/** PMS monitor: the room's bed. */
export const PmsMonitorIcon = createLucideIcon("gridone-pms-monitor", [
  ["path", { d: "M3 18.5V6.5", key: "headboard" }],
  ["path", { d: "M3 14h18v4.5", key: "frame" }],
  ["path", { d: "M21 14a3 3 0 0 0-3-3h-7.5v3", key: "mattress" }],
  ["circle", { cx: "6.8", cy: "11.2", r: "1.6", key: "pillow" }],
]);
