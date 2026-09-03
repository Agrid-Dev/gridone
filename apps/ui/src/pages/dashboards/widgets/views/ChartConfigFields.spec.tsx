import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { useForm, type Control, type FieldValues } from "react-hook-form";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "widgets.chart.agg.label": "Aggregation",
    "widgets.chart.agg.description": "Bucket width follows the period.",
    "widgets.chart.agg.captions.raw": "every recorded point",
    "widgets.chart.agg.captions.avg": "mean of the bucket",
    "widgets.chart.agg.captions.min": "lowest value",
    "widgets.chart.agg.captions.mode": "most frequent value",
    "widgets.chart.agg.unsupported": "not supported",
    "widgets.chart.interval.label": "Bucket width",
    "widgets.chart.interval.description": "How wide each bucket is.",
    "widgets.chart.interval.captions.auto": "sized from the period",
    "widgets.chart.interval.captions.1h": "per hour",
    "widgets.chart.interval.captions.1d": "per day",
    "widgets.chart.space.label": "Space aggregation",
    "widgets.chart.space.description": "Folds the devices into one series.",
    "widgets.chart.space.captions.none": "one series per device",
    "widgets.chart.space.captions.avg": "mean across devices",
    "widgets.chart.space.captions.min": "lowest across devices",
    "widgets.chart.space.captions.mode": "most frequent across devices",
    "widgets.chart.groupBy.label": "Group by tag",
    "widgets.chart.groupBy.description":
      "Splits into one series per tag value.",
    "widgets.chart.groupBy.placeholder": "Tag key",
    "widgets.chart.groupBy.preview": "{{total}} devices — {{breakdown}}",
    "widgets.chart.groupBy.previewEmpty": "No device carries this tag key yet.",
    "widgets.chart.groupBy.previewError": "Could not load the tag preview.",
    "widgets.chart.groupBy.untagged": "Untagged",
    "widgets.chart.groupBy.highCardinality":
      "{{count}} groups — colors repeat past {{max}}.",
  }),
);

// Stand in for the target picker, exposing a button per canned target so a
// change can be driven without reaching into its internals. Coverage over the
// picked set is what gives the editor its data type; the fixtures mirror a
// thermostat set recording a float and a string attribute.
vi.mock("@/components/forms/targetPicker", () => ({
  AttributeTargetPicker: ({
    onChange,
  }: {
    onChange: (next: {
      devices: { ids?: string[]; types?: string[] };
      attribute?: string;
    }) => void;
  }) => (
    <div>
      {["temperature", "mode"].map((attr) => (
        <button
          key={attr}
          type="button"
          onClick={() =>
            onChange({ devices: { ids: ["dev1", "dev2"] }, attribute: attr })
          }
        >
          pick {attr}
        </button>
      ))}
    </div>
  ),
  toPickerTarget: (value: unknown) => {
    if (typeof value !== "object" || value === null) return { devices: {} };
    const { devices, attribute } = value as {
      devices?: unknown;
      attribute?: string;
    };
    return { devices: devices ?? {}, attribute };
  },
  useAttributeCoverage: () => ({
    coverage: [
      {
        attribute: "temperature",
        data_types: ["float"],
        device_count: 2,
        writable_count: 0,
      },
      {
        attribute: "mode",
        data_types: ["str"],
        device_count: 2,
        writable_count: 0,
      },
    ],
    totalDevices: 2,
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/hooks/useDevicesList", () => ({
  useDevicesList: () => ({ devices: [], loading: false, error: null }),
}));

const useTagGroups = vi.fn();
vi.mock("./useTagGroups", () => ({
  useTagGroups: (...args: unknown[]) => useTagGroups(...args),
}));

// Mirrors the backend matrix: every operator against every type, mapped to
// what it yields, or null where the pair is refused.
const MATRIX = {
  float: { avg: "float", min: "float", mode: "float" },
  str: { avg: null, min: null, mode: "str" },
};

vi.mock("@/hooks/useAggregateOptions", async () => {
  const actual = await vi.importActual<
    typeof import("@/hooks/useAggregateOptions")
  >("@/hooks/useAggregateOptions");
  return {
    // The real projection — this spec is about how the editor renders it.
    operatorsFor: actual.operatorsFor,
    spaceOperatorsFor: actual.spaceOperatorsFor,
    useResetRefusedOperator: actual.useResetRefusedOperator,
    useAggregateOptions: () => ({
      data: {
        intervals: [
          { interval: "raw", bucket_count: null },
          { interval: "whole", bucket_count: null },
          { interval: "1h", bucket_count: null },
          { interval: "1d", bucket_count: null },
        ],
        operators_by_data_type: MATRIX,
        space_operators_by_data_type: MATRIX,
      },
    }),
  };
});

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select
      data-testid="agg"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    value,
    children,
    disabled,
  }: {
    value: string;
    children: React.ReactNode;
    disabled?: boolean;
  }) => (
    <option value={value} disabled={disabled}>
      {children}
    </option>
  ),
}));

// Imported after the mocks are registered.
import { ChartConfigFields } from "./ChartConfigFields";

/** Renders the fields in a real form and exposes the live config values. */
function Harness({
  onValues,
  defaultConfig = {},
}: {
  onValues: (config: Record<string, unknown>) => void;
  defaultConfig?: Record<string, unknown>;
}) {
  const form = useForm({
    defaultValues: {
      config: {
        type: "chart",
        target: "",
        agg: null,
        space_agg: null,
        ...defaultConfig,
      },
    },
  });
  onValues(form.watch("config"));
  return (
    <ChartConfigFields
      control={form.control as unknown as Control<FieldValues>}
    />
  );
}

function renderFields(defaultConfig?: Record<string, unknown>) {
  const values: Record<string, unknown>[] = [];
  render(
    <Harness onValues={(c) => values.push(c)} defaultConfig={defaultConfig} />,
  );
  return () => values[values.length - 1];
}

const items = () =>
  Array.from(screen.getByTestId("agg").querySelectorAll("option"));

/** The operators a user can actually choose right now, by stored value. Raw is
 *  stored as `null`, which the select keys as the string "null". */
const enabled = () =>
  items()
    .filter((o) => !o.disabled)
    .map((o) => o.getAttribute("value"));

beforeEach(() => {
  useTagGroups.mockReturnValue({
    groups: [],
    totalDevices: 0,
    isLoading: false,
    error: null,
  });
});

afterEach(() => {
  cleanup();
  useTagGroups.mockClear();
});

/** Where the fold-across-devices select sits among the mock's flat list:
 *  after the operator and the bucket width, both of which precede it in the
 *  form. */
const SPACE_SELECT = 2;

/** Where the bucket-width select sits: straight after the operator it cuts
 *  buckets for. */
const INTERVAL_SELECT = 1;

describe("ChartConfigFields", () => {
  // The persisted target shape and nothing else — no runtime keys, no legacy
  // device_id.
  it("emits the picked target as config.target", () => {
    const latest = renderFields();

    fireEvent.click(screen.getByText("pick temperature"));

    expect(latest()).toEqual({
      type: "chart",
      target: { devices: { ids: ["dev1", "dev2"] }, attribute: "temperature" },
      agg: null,
      interval: "auto",
      space_agg: null,
    });
  });

  // The data type now belongs to the whole set, read from its coverage: the
  // operators that type refuses stay listed but disabled.
  it("disables the operators the set's data type refuses", () => {
    renderFields({
      target: { devices: { ids: ["dev1", "dev2"] }, attribute: "mode" },
    });
    expect(enabled()).toEqual(["null", "mode"]);
  });

  // A saved widget's set can be re-driven under its operator; what matters is
  // the type coverage reports now, not the one that justified the save.
  it("clears an operator the set's data type refuses", () => {
    const latest = renderFields({
      target: { devices: { ids: ["dev1", "dev2"] }, attribute: "mode" },
      agg: "avg",
    });

    expect(latest().agg).toBeNull();
  });

  it("keeps an operator the set's data type admits", () => {
    const latest = renderFields({
      target: { devices: { ids: ["dev1", "dev2"] }, attribute: "temperature" },
      agg: "avg",
    });

    expect(latest().agg).toBe("avg");
  });

  // Space aggregation runs on what the time operator yields, so it is only
  // offered once one is chosen — raw series cannot be folded.
  it("offers space operators only once a time operator is chosen", () => {
    renderFields({
      target: { devices: { ids: ["dev1", "dev2"] }, attribute: "temperature" },
      agg: "avg",
    });

    // Three selects once an operator is picked: the operator, the bucket
    // width it cuts, then the fold across devices.
    const selects = screen.getAllByTestId("agg");
    expect(selects).toHaveLength(3);
    const spaceValues = Array.from(
      selects[SPACE_SELECT].querySelectorAll("option"),
    )
      .filter((o) => !o.disabled)
      .map((o) => o.getAttribute("value"));
    // `null` keeps one series per device; the rest is the space vocabulary the
    // chain's output type admits (the fixture matrix only defines avg/min/mode).
    expect(spaceValues).toEqual(["null", "avg", "min", "mode"]);
  });

  // Widths cut buckets an operator fills, so the picker follows the operator —
  // and offers only widths a chart can draw: `raw` applies no operator at all
  // and `whole` yields the single point a KPI shows, not a chart.
  it("offers the chartable widths once an operator is chosen", () => {
    renderFields({
      target: { devices: { ids: ["dev1", "dev2"] }, attribute: "temperature" },
      agg: "avg",
    });

    const widths = Array.from(
      screen.getAllByTestId("agg")[INTERVAL_SELECT].querySelectorAll("option"),
    ).map((o) => o.getAttribute("value"));
    expect(widths).toEqual(["auto", "1h", "1d"]);
  });

  it("returns the width to auto when the operator is dropped", () => {
    const latest = renderFields({
      target: { devices: { ids: ["dev1", "dev2"] }, attribute: "temperature" },
      agg: "avg",
      interval: "1d",
    });

    fireEvent.change(screen.getAllByTestId("agg")[0], {
      target: { value: "null" },
    });

    expect(latest().agg).toBeNull();
    expect(latest().interval).toBe("auto");
  });

  it("hides space aggregation for raw charts", () => {
    renderFields({
      target: { devices: { ids: ["dev1", "dev2"] }, attribute: "temperature" },
      agg: null,
    });

    expect(screen.getAllByTestId("agg")).toHaveLength(1);
  });

  it("clears the space operator when the time operator is dropped", () => {
    const latest = renderFields({
      target: { devices: { ids: ["dev1", "dev2"] }, attribute: "temperature" },
      agg: null,
      space_agg: "avg",
    });

    expect(latest().space_agg).toBeNull();
  });

  // group_by only makes sense once devices are being folded into groups —
  // same dependency the backend enforces at save time.
  it("hides group-by until a fold operator is chosen", () => {
    renderFields({
      target: { devices: { ids: ["dev1", "dev2"] }, attribute: "temperature" },
      agg: "avg",
      space_agg: null,
    });

    expect(screen.queryByLabelText("Group by tag")).not.toBeInTheDocument();
  });

  it("stores the typed tag key once a fold operator is chosen", () => {
    const latest = renderFields({
      target: { devices: { ids: ["dev1", "dev2"] }, attribute: "temperature" },
      agg: "avg",
      space_agg: "avg",
    });

    fireEvent.change(screen.getByLabelText("Group by tag"), {
      target: { value: "floor" },
    });

    expect(latest().group_by).toBe("floor");
  });

  it("clears group_by when the fold operator is dropped", () => {
    const latest = renderFields({
      target: { devices: { ids: ["dev1", "dev2"] }, attribute: "temperature" },
      agg: "avg",
      space_agg: "avg",
      group_by: "floor",
    });

    // "null" is the mock select's string key for the stored `null` value.
    fireEvent.change(screen.getAllByTestId("agg")[SPACE_SELECT], {
      target: { value: "null" },
    });

    expect(latest().group_by).toBeNull();
  });

  // The preview must reproduce the same device set the grouped chart will
  // actually query — devices matching the filter but not exposing the
  // attribute are excluded there too, so the preview passes it along.
  it("scopes the tag-groups preview to the target's attribute", () => {
    renderFields({
      target: { devices: { ids: ["dev1", "dev2"] }, attribute: "temperature" },
      agg: "avg",
      space_agg: "avg",
    });

    fireEvent.change(screen.getByLabelText("Group by tag"), {
      target: { value: "floor" },
    });

    expect(useTagGroups).toHaveBeenLastCalledWith(
      { ids: ["dev1", "dev2"] },
      "floor",
      "temperature",
      expect.objectContaining({ enabled: true }),
    );
  });

  // An empty device filter is a legal target — it means "all devices" — so
  // the preview must still query for it rather than treat it as unset.
  it("still previews for an empty device filter", () => {
    useTagGroups.mockReturnValue({
      groups: [],
      totalDevices: 0,
      isLoading: false,
      error: null,
    });
    renderFields({
      target: { devices: {}, attribute: "temperature" },
      agg: "avg",
      space_agg: "avg",
      group_by: "floor",
    });

    expect(useTagGroups).toHaveBeenLastCalledWith(
      {},
      "floor",
      "temperature",
      expect.objectContaining({ enabled: true }),
    );
    expect(
      screen.getByText("No device carries this tag key yet."),
    ).toBeInTheDocument();
  });

  it("surfaces a preview request failure instead of the empty message", () => {
    useTagGroups.mockReturnValue({
      groups: [],
      totalDevices: 0,
      isLoading: false,
      error: new Error("boom"),
    });
    renderFields({
      target: { devices: { ids: ["dev1"] }, attribute: "temperature" },
      agg: "avg",
      space_agg: "avg",
      group_by: "floor",
    });

    expect(
      screen.getByText("Could not load the tag preview."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No device carries this tag key yet."),
    ).not.toBeInTheDocument();
  });
});
