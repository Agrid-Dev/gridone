import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    "widgets.chart.space.label": "Space aggregation",
    "widgets.chart.space.description": "Folds the devices into one series.",
    "widgets.chart.space.captions.none": "one series per device",
    "widgets.chart.space.captions.avg": "mean across devices",
    "widgets.chart.space.captions.min": "lowest across devices",
    "widgets.chart.space.captions.mode": "most frequent across devices",
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

afterEach(cleanup);

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

    const selects = screen.getAllByTestId("agg");
    expect(selects).toHaveLength(2);
    const spaceValues = Array.from(selects[1].querySelectorAll("option"))
      .filter((o) => !o.disabled)
      .map((o) => o.getAttribute("value"));
    // `null` keeps one series per device; the rest is the space vocabulary the
    // chain's output type admits (the fixture matrix only defines avg/min/mode).
    expect(spaceValues).toEqual(["null", "avg", "min", "mode"]);
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
});
