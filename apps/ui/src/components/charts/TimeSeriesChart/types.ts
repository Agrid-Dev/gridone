export type FloatDatum = { timestamp: Date; value: number };
export type BoolDatum = { timestamp: Date; value: number };

export type Series = {
  key: string;
  label: string;
};

export type TimeSeriesChartProps = {
  timestamps: Date[];
  /** Float series — rendered as lines, sharing a single y-axis (top panel) */
  lineSeries?: Series[];
  lineValues?: Record<string, (number | null)[]>;
  /** Boolean series — each rendered as a step-area in its own panel below */
  booleanSeries?: Series[];
  booleanValues?: Record<string, (boolean | null)[]>;
  /** String series — each rendered as a color-coded step-area in its own panel */
  stringSeries?: Series[];
  stringValues?: Record<string, (string | null)[]>;
  /** Height of the float line panel */
  lineHeight?: number;
  /** Height of each boolean / string categorical panel */
  categoricalHeight?: number;
};

export type TooltipRow = {
  label: string;
  value: string;
  active?: boolean;
  swatch?: { color: string; variant: "line" | "area" };
};

// ---------------------------------------------------------------------------
// Panel registry types
// ---------------------------------------------------------------------------

export type FloatPanelEntry = {
  type: "float";
  key: "float";
  series: Series[];
  values: Record<string, (number | null)[]>;
  height: number;
};

export type BooleanPanelEntry = {
  type: "boolean";
  key: string;
  series: Series;
  values: (boolean | null)[];
  height: number;
};

export type StringPanelEntry = {
  type: "string";
  key: string;
  series: Series;
  values: (string | null)[];
  height: number;
};

export type PanelEntry = FloatPanelEntry | BooleanPanelEntry | StringPanelEntry;

export type PanelComponentProps = {
  entry: PanelEntry;
  timestamps: Date[];
  width: number;
  isLast: boolean;
};
