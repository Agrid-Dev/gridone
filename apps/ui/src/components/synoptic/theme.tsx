/**
 * Shared palette and SVG defs for the SCADA symbol library.
 * Every component reads its colors from here so a BMS theme
 * can be swapped in one place.
 */
export const COLORS = {
  bg: "#131d2a",

  // pipe flow colors
  steam: "#dc2b41",
  water: "#6ea24b",
  oil: "#e8b64a",

  text: "#f2f4f6",
  vesselLabel: "#1a1d21",
  metalStroke: "#7f8790",

  panelStroke: "#e8eaed",
  valueBoxFill: "#332017",
  valueBoxStroke: "#c87e3d",
  statusOk: "#7cb342",
  statusWarn: "#f0af3d",
  statusIdle: "#f4f6f8",

  badgeFill: "#1f2a39",
  badgeStroke: "#8a93a0",

  pumpFill: "#f19cb4",
  pumpStroke: "#a93b5e",
  pumpDark: "#d2688b",

  valveRed: "#d6303c",
  valveRedStroke: "#8f2029",
  valveWhite: "#f2f4f6",
  valveWhiteStroke: "#9aa2ab",

  portFill: "#ffffff",
  portStroke: "#8b929b",

  instrument: "#e8eaed",
};

export const FONT = `'Segoe UI', system-ui, -apple-system, sans-serif`;

/** Gradient defs shared by all metallic vessels. Rendered once by PidDiagram. */
export function SymbolDefs() {
  return (
    <defs>
      <linearGradient id="scada-metal" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#9ea5ad" />
        <stop offset="0.3" stopColor="#e6e9ec" />
        <stop offset="0.5" stopColor="#fbfcfd" />
        <stop offset="0.72" stopColor="#dde1e5" />
        <stop offset="1" stopColor="#8e959d" />
      </linearGradient>
    </defs>
  );
}

/** Dark bold label rendered on top of a metallic vessel. */
export function VesselLabel({
  x,
  y,
  text,
  size = 20,
}: {
  x: number;
  y: number;
  text: string;
  size?: number;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={size}
      fontWeight={700}
      fill={COLORS.vesselLabel}
    >
      {text}
    </text>
  );
}
