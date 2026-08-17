import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { useForm, type Control, type FieldValues } from "react-hook-form";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "widgets.kpi.temporal.live": "Live",
    "widgets.kpi.temporal.period": "Over the period",
    "widgets.kpi.operator.label": "Aggregation",
    "widgets.kpi.operator.placeholder": "Select…",
    "widgets.kpi.unit.label": "Unit",
    "widgets.kpi.precision.label": "Precision",
    "widgets.chart.agg.captions.avg": "mean of the bucket",
    "widgets.chart.agg.captions.sum": "total of the bucket",
    "widgets.chart.agg.captions.mode": "most frequent value",
    "widgets.chart.agg.unsupported": "not supported",
  }),
);

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
            onChange({ devices: { ids: ["dev1"] }, attribute: attr })
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
        device_count: 1,
        writable_count: 0,
      },
      {
        attribute: "mode",
        data_types: ["str"],
        device_count: 1,
        writable_count: 0,
      },
    ],
    totalDevices: 1,
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/hooks/useDevicesList", () => ({
  useDevicesList: () => ({ devices: [], loading: false, error: null }),
}));

// Real Radix Tabs need pointer-event sequencing jsdom does not emulate for a
// plain `fireEvent.click`; a minimal context-backed stand-in keeps the mode
// switch testable the same way the select mock below does for operators.
const TabsCtx = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
}>({ value: "", onValueChange: () => {} });

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <TabsCtx.Provider value={{ value, onValueChange }}>
      {children}
    </TabsCtx.Provider>
  ),
  TabsList: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TabsTrigger: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => {
    const ctx = React.useContext(TabsCtx);
    return (
      <button type="button" onClick={() => ctx.onValueChange(value)}>
        {children}
      </button>
    );
  },
  TabsContent: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => {
    const ctx = React.useContext(TabsCtx);
    return ctx.value === value ? <div>{children}</div> : null;
  },
}));

const MATRIX = {
  float: { avg: "float", sum: "float", mode: null },
  str: { avg: null, sum: null, mode: "str" },
};

vi.mock("@/hooks/useAggregateOptions", async () => {
  const actual = await vi.importActual<
    typeof import("@/hooks/useAggregateOptions")
  >("@/hooks/useAggregateOptions");
  return {
    operatorsFor: actual.operatorsFor,
    useAggregateOptions: () => ({ data: { operators_by_data_type: MATRIX } }),
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
      data-testid="operator"
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
import { KpiConfigFields, kpiConfigCheck } from "./KpiConfigFields";

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
        type: "kpi",
        target: "",
        temporal: "live",
        unit: "",
        precision: undefined,
        ...defaultConfig,
      },
    },
  });
  onValues(form.watch("config"));
  return (
    <KpiConfigFields
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

afterEach(cleanup);

describe("KpiConfigFields", () => {
  it("emits the picked target as config.target", () => {
    const latest = renderFields();

    fireEvent.click(screen.getByText("pick temperature"));

    expect((latest().target as { attribute?: string }).attribute).toBe(
      "temperature",
    );
  });

  it("starts in live mode with no operator select shown", () => {
    renderFields();

    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.queryByTestId("operator")).not.toBeInTheDocument();
  });

  it("switches to period mode and shows the operator select", () => {
    const latest = renderFields({
      target: { devices: { ids: ["dev1"] }, attribute: "temperature" },
    });

    fireEvent.click(screen.getByText("Over the period"));

    expect(latest().temporal).toEqual({});
    expect(screen.getByTestId("operator")).toBeInTheDocument();
  });

  it("disables operators the attribute's data type refuses", () => {
    renderFields({
      target: { devices: { ids: ["dev1"] }, attribute: "mode" },
      temporal: {},
    });

    const options = Array.from(
      screen.getByTestId("operator").querySelectorAll("option"),
    );
    const enabled = options.filter((o) => !o.disabled).map((o) => o.value);
    expect(enabled).toEqual(["mode"]);
  });

  it("clears the operator when the attribute's data type refuses it", () => {
    const latest = renderFields({
      target: { devices: { ids: ["dev1"] }, attribute: "mode" },
      temporal: { operator: "avg" },
    });

    expect(
      (latest().temporal as { operator?: string }).operator,
    ).toBeUndefined();
  });
});

describe("kpiConfigCheck", () => {
  it("accepts a single explicit device id", () => {
    const result = kpiConfigCheck.safeParse({
      target: { devices: { ids: ["dev1"] }, attribute: "temperature" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than one device id", () => {
    const result = kpiConfigCheck.safeParse({
      target: { devices: { ids: ["dev1", "dev2"] }, attribute: "temperature" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a type-filter target", () => {
    const result = kpiConfigCheck.safeParse({
      target: { devices: { types: ["thermostat"] }, attribute: "temperature" },
    });
    expect(result.success).toBe(false);
  });
});
