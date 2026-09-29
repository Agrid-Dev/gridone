export type FloatDatum = { timestamp: Date; value: number };
export type BoolDatum = { timestamp: Date; value: number };

export type Series = {
  key: string;
  label: string;
  /** Optional destination for an identified device series; aggregate series remain plain text. */
  href?: string;
  /** Attribute name resolving semantic value colours (string panels). Falls
   *  back to `key` — right when the series is keyed by its attribute, needed
   *  when it is keyed by something else (a dashboard chart keys per device). */
  semanticKey?: string;
  /** Render the line (and its legend swatch) dashed — e.g. a setpoint drawn
   *  against its measured value. Line panels only. */
  dash?: boolean;
  /** Wording of a boolean series' two states, already resolved by the caller
   *  — the tooltip names the one hovered. Boolean panels only; raw true /
   *  false without it. */
  booleanLabels?: { true: string; false: string };
  /** Wording of a string series' values, already resolved by the caller
   *  (an HVAC mode reads "Chauffage" rather than "heat") — the legend and
   *  the tooltip name a value by it, colours still follow the wire value.
   *  String panels only; raw values without it. */
  stringLabels?: Record<string, string>;
  /** Unit symbol of a numeric series, as its driver declares it. Numeric
   *  series are panelled by unit, each panel's axis carrying the unit its
   *  series share. Without it the name convention decides (`temperature`
   *  is degrees), and a series with neither keeps an unlabelled axis rather
   *  than a guessed unit. */
  unit?: string | null;
};

export type TimeSeriesChartProps = {
  timestamps: Date[];
  /** Float series — rendered as lines, one panel and y-axis per unit (top panels) */
  lineSeries?: Series[];
  lineValues?: Record<string, (number | null)[]>;
  /** Integer series — rendered as step lines in the float panel of their unit, sharing its y-axis */
  intSeries?: Series[];
  intValues?: Record<string, (number | null)[]>;
  /** Boolean series — each rendered as a step-area in its own panel below */
  booleanSeries?: Series[];
  booleanValues?: Record<string, (boolean | null)[]>;
  /** String series — each rendered as a color-coded step-area in its own panel */
  stringSeries?: Series[];
  stringValues?: Record<string, (string | null)[]>;
  /** How the numeric series are drawn: interpolated/step lines, or bars over
   *  the buckets they report. Bars only make sense for aggregated series;
   *  the caller decides, this only draws it. Defaults to lines. */
  numericMark?: "line" | "bar";
  /** The order to stack the panels in, by panel key (`float:<unit>` for a
   *  unit's line panel, the series key for a boolean or string band). Keys
   *  the chart has no panel for are ignored; panels the order does not
   *  name follow in their default order. */
  panelOrder?: string[];
  /** Offered when set: every panel gets a drag handle and a drop reports
   *  the full new order. */
  onPanelOrderChange?: (panelKeys: string[]) => void;
  /** Wording of a panel's drag handle, given the panel's label. Defaults
   *  to the label itself. */
  dragHandleLabel?: (panelLabel: string) => string;
  /** What a screen reader hears while a panel is reordered by keyboard,
   *  worded by the caller in its language; dnd-kit's English defaults
   *  otherwise. */
  dragWording?: PanelDragWording;
  /** Height of each float line panel */
  lineHeight?: number;
  /** Height of each boolean / string categorical panel */
  categoricalHeight?: number;
};

/** Screen-reader wording of a panel drag, each given the panels' labels. */
export type PanelDragWording = {
  /** How to operate a handle, read once when one takes focus. */
  instructions: string;
  pickedUp: (panel: string) => string;
  movedOver: (panel: string, over: string) => string;
  dropped: (panel: string, over: string | null) => string;
  cancelled: (panel: string) => string;
};

export type TooltipRow = {
  label: string;
  value: string;
  active?: boolean;
  swatch?: { color: string; variant: "line" | "area"; hollow?: boolean };
};

// ---------------------------------------------------------------------------
// Panel registry types
// ---------------------------------------------------------------------------

export type FloatPanelEntry = {
  type: "float";
  /** `float:<unit>` — one float panel per unit, the unitless one `float:`. */
  key: string;
  /** The unit every series on the panel shares; null for the bare panel. */
  unit: string | null;
  series: Series[];
  values: Record<string, (number | null)[]>;
  /** Keys of series rendered as step lines (integer series) rather than interpolated lines. */
  stepKeys: string[];
  height: number;
  /** Position of the panel's first series in the chart's palette, so colours
   *  stay distinct across the unit panels instead of restarting in each. */
  colorOffset: number;
};

export type BarPanelEntry = {
  type: "bar";
  key: "bar";
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

export type PanelEntry =
  | FloatPanelEntry
  | BarPanelEntry
  | BooleanPanelEntry
  | StringPanelEntry;

export type PanelComponentProps = {
  entry: PanelEntry;
  timestamps: Date[];
  width: number;
  isLast: boolean;
};
