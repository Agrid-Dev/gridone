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
    "widgets.kpi.attribute.label": "Attribute {{index}}",
    "widgets.kpi.attribute.add": "Add attribute",
    "widgets.kpi.attribute.remove": "Remove attribute",
    "widgets.chart.agg.captions.avg": "mean of the bucket",
    "widgets.chart.agg.captions.sum": "total of the bucket",
    "widgets.chart.agg.captions.mode": "most frequent value",
    "widgets.chart.agg.unsupported": "not supported",
    "widgets.kpi.singleDeviceRequired":
      "Pick a single device, or a fold operator below to combine several",
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
      <button
        type="button"
        onClick={() =>
          onChange({
            devices: { ids: ["dev1", "dev2"] },
            attribute: "temperature",
          })
        }
      >
        pick two devices
      </button>
    </div>
  ),
  AttributeCoverageSelect: ({
    onChange,
  }: {
    onChange: (attribute: string, dataType: string) => void;
  }) => (
    <div>
      {["temperature", "mode"].map((attr) => (
        <button
          key={attr}
          type="button"
          onClick={() =>
            onChange(attr, attr === "temperature" ? "float" : "str")
          }
        >
          pick attribute {attr}
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
import {
  BLANK_ATTRIBUTE,
  KpiConfigFields,
  kpiConfigCheck,
} from "./KpiConfigFields";

function Harness({
  onValues,
  defaultAttributes = [BLANK_ATTRIBUTE],
  defaultConfig = {},
}: {
  onValues: (config: Record<string, unknown>) => void;
  defaultAttributes?: Record<string, unknown>[];
  defaultConfig?: Record<string, unknown>;
}) {
  const form = useForm({
    defaultValues: {
      config: {
        type: "kpi",
        attributes: defaultAttributes,
        temporal: "live",
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

function renderFields(
  defaultAttributes?: Record<string, unknown>[],
  defaultConfig?: Record<string, unknown>,
) {
  const values: Record<string, unknown>[] = [];
  render(
    <Harness
      onValues={(c) => values.push(c)}
      defaultAttributes={defaultAttributes}
      defaultConfig={defaultConfig}
    />,
  );
  return () => values[values.length - 1];
}

function firstAttribute(config: Record<string, unknown>) {
  return (config.attributes as Record<string, unknown>[])[0];
}

const SINGLE_DEVICE_TARGET = {
  devices: { ids: ["dev1"] },
  attribute: "temperature",
};
const TWO_DEVICE_IDS_TARGET = {
  devices: { ids: ["dev1", "dev2"] },
  attribute: "temperature",
};
const CRITERIA_TARGET = {
  devices: { types: ["thermostat"] },
  attribute: "temperature",
};

afterEach(cleanup);

describe("KpiConfigFields", () => {
  it("emits the picked target on the first attribute", () => {
    const latest = renderFields();

    fireEvent.click(screen.getByText("pick temperature"));

    const target = firstAttribute(latest()).target as { attribute?: string };
    expect(target.attribute).toBe("temperature");
  });

  it("starts in live mode with no operator select shown", () => {
    renderFields();

    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.queryByTestId("operator")).not.toBeInTheDocument();
  });

  it("switches to period mode and shows the operator select", () => {
    const latest = renderFields([
      { ...BLANK_ATTRIBUTE, target: SINGLE_DEVICE_TARGET },
    ]);

    fireEvent.click(screen.getByText("Over the period"));

    expect(latest().temporal).toEqual({});
    expect(screen.getByTestId("operator")).toBeInTheDocument();
  });

  it("disables operators the first attribute's data type refuses", () => {
    renderFields(
      [
        {
          ...BLANK_ATTRIBUTE,
          target: { devices: { ids: ["dev1"] }, attribute: "mode" },
        },
      ],
      { temporal: {} },
    );

    const options = Array.from(
      screen.getByTestId("operator").querySelectorAll("option"),
    );
    const enabled = options.filter((o) => !o.disabled).map((o) => o.value);
    expect(enabled).toEqual(["mode"]);
  });

  it("clears the operator when the first attribute's data type refuses it", () => {
    const latest = renderFields(
      [
        {
          ...BLANK_ATTRIBUTE,
          target: { devices: { ids: ["dev1"] }, attribute: "mode" },
        },
      ],
      { temporal: { operator: "avg" } },
    );

    expect(
      (latest().temporal as { operator?: string }).operator,
    ).toBeUndefined();
  });

  it("names the constraint when a target picks more than one device and no operator is chosen", () => {
    renderFields();

    fireEvent.click(screen.getByText("pick two devices"));

    expect(
      screen.getByText(
        "Pick a single device, or a fold operator below to combine several",
      ),
    ).toBeInTheDocument();
  });

  it("shows no constraint warning before anything is picked", () => {
    renderFields();

    expect(
      screen.queryByText(
        "Pick a single device, or a fold operator below to combine several",
      ),
    ).not.toBeInTheDocument();
  });

  it("clears the constraint warning once a fold operator is picked", () => {
    renderFields([
      { ...BLANK_ATTRIBUTE, target: TWO_DEVICE_IDS_TARGET, space_agg: "avg" },
    ]);

    expect(
      screen.queryByText(
        "Pick a single device, or a fold operator below to combine several",
      ),
    ).not.toBeInTheDocument();
  });

  it("hides the space select for a single explicit device id", () => {
    renderFields([{ ...BLANK_ATTRIBUTE, target: SINGLE_DEVICE_TARGET }]);

    expect(screen.queryByTestId("operator")).not.toBeInTheDocument();
  });

  it("shows the space select once a target can match more than one device", () => {
    renderFields([{ ...BLANK_ATTRIBUTE, target: CRITERIA_TARGET }]);

    const select = screen.getByTestId("operator");
    const enabled = Array.from(select.querySelectorAll("option"))
      .filter((o) => !o.disabled)
      .map((o) => o.value);
    expect(enabled).toEqual(["avg", "sum"]);
  });

  it("emits the picked space operator on the attribute", () => {
    const latest = renderFields([
      { ...BLANK_ATTRIBUTE, target: CRITERIA_TARGET },
    ]);

    fireEvent.change(screen.getByTestId("operator"), {
      target: { value: "sum" },
    });

    expect(firstAttribute(latest()).space_agg).toBe("sum");
  });

  it("clears space_agg once the target narrows to a single device", () => {
    const latest = renderFields([
      { ...BLANK_ATTRIBUTE, target: CRITERIA_TARGET, space_agg: "avg" },
    ]);

    fireEvent.click(screen.getByText("pick temperature"));

    expect(firstAttribute(latest()).space_agg).toBeNull();
  });

  // Space folds what the period operator yields, so there's nothing to
  // offer until one is picked — showing a populated-but-fully-disabled
  // select there would look broken rather than merely premature.
  it("hides the space select in period mode until a time operator is chosen", () => {
    renderFields([{ ...BLANK_ATTRIBUTE, target: CRITERIA_TARGET }], {
      temporal: {},
    });

    expect(screen.getAllByTestId("operator")).toHaveLength(1);
  });

  it("shows the space select in period mode once a time operator is chosen", () => {
    renderFields([{ ...BLANK_ATTRIBUTE, target: CRITERIA_TARGET }], {
      temporal: { operator: "avg" },
    });

    expect(screen.getAllByTestId("operator")).toHaveLength(2);
  });

  it("starts with one blank attribute when the array is empty", () => {
    const latest = renderFields([]);

    expect((latest().attributes as unknown[]).length).toBe(1);
  });

  it("adds another attribute row on Add attribute", () => {
    const latest = renderFields();

    fireEvent.click(screen.getByText("Add attribute"));

    expect((latest().attributes as unknown[]).length).toBe(2);
  });

  it("seeds a new row with the last row's device selection", () => {
    const latest = renderFields([
      { ...BLANK_ATTRIBUTE, target: CRITERIA_TARGET },
    ]);

    fireEvent.click(screen.getByText("Add attribute"));

    const attributes = latest().attributes as {
      target: { devices: unknown; attribute: string };
    }[];
    expect(attributes).toHaveLength(2);
    expect(attributes[1].target.devices).toEqual(CRITERIA_TARGET.devices);
    expect(attributes[1].target.attribute).toBe("");
  });

  it("shows the device picker only for the first row", () => {
    renderFields([
      { ...BLANK_ATTRIBUTE, target: CRITERIA_TARGET },
      {
        ...BLANK_ATTRIBUTE,
        target: { devices: { types: ["thermostat"] }, attribute: "" },
      },
    ]);

    // One device picker (row 0's "pick two devices" button is unique to it).
    expect(screen.getAllByText("pick two devices")).toHaveLength(1);
    // Both rows offer an attribute pick, row 0 via the full picker and row 1
    // via the coverage-only select.
    expect(screen.getAllByText("pick temperature")).toHaveLength(1);
    expect(screen.getAllByText("pick attribute temperature")).toHaveLength(1);
  });

  it("keeps later rows' devices in sync when the first row's change", () => {
    const latest = renderFields([
      { ...BLANK_ATTRIBUTE, target: SINGLE_DEVICE_TARGET },
      {
        ...BLANK_ATTRIBUTE,
        target: { devices: { ids: ["dev1"] }, attribute: "mode" },
      },
    ]);

    fireEvent.click(screen.getByText("pick two devices"));

    const attributes = latest().attributes as {
      target: { devices: unknown; attribute: string };
    }[];
    expect(attributes[1].target.devices).toEqual({
      ids: ["dev1", "dev2"],
    });
    expect(attributes[1].target.attribute).toBe("mode");
  });

  it("removes an attribute row, keeping each row's own target", () => {
    const latest = renderFields([
      { ...BLANK_ATTRIBUTE, target: SINGLE_DEVICE_TARGET },
      {
        ...BLANK_ATTRIBUTE,
        target: { devices: { ids: ["dev1"] }, attribute: "mode" },
      },
    ]);

    fireEvent.click(screen.getAllByLabelText("Remove attribute")[0]);

    const attributes = latest().attributes as {
      target: { attribute: string };
    }[];
    expect(attributes).toHaveLength(1);
    expect(attributes[0].target.attribute).toBe("mode");
  });

  it("disables removal of the last remaining attribute", () => {
    renderFields();

    expect(screen.getByLabelText("Remove attribute")).toBeDisabled();
  });
});

describe("kpiConfigCheck", () => {
  it("accepts a single explicit device id", () => {
    const result = kpiConfigCheck.safeParse({
      attributes: [{ target: SINGLE_DEVICE_TARGET }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than one device id", () => {
    const result = kpiConfigCheck.safeParse({
      attributes: [{ target: TWO_DEVICE_IDS_TARGET }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a type-filter target", () => {
    const result = kpiConfigCheck.safeParse({
      attributes: [{ target: CRITERIA_TARGET }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a type-filter target with a fold operator", () => {
    const result = kpiConfigCheck.safeParse({
      attributes: [{ target: CRITERIA_TARGET, space_agg: "avg" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts several device ids with a fold operator", () => {
    const result = kpiConfigCheck.safeParse({
      attributes: [{ target: TWO_DEVICE_IDS_TARGET, space_agg: "sum" }],
    });
    expect(result.success).toBe(true);
  });

  it("checks every attribute independently", () => {
    const result = kpiConfigCheck.safeParse({
      attributes: [
        { target: SINGLE_DEVICE_TARGET },
        {
          target: { devices: { types: ["thermostat"] }, attribute: "mode" },
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
