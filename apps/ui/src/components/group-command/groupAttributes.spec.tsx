import type { PresentationV1 } from "@/components/device-ui/document";
import { groupJudge, layoutsAgree } from "./groupAttributes";
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Device, Driver } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { aggregateGroupAttributes } from "./groupAttributes";
import { useGroupRuntime } from "./useGroupRuntime";
import {
  currentValueFor,
  resolveFilter,
  targetFilterToDevicesFilter,
} from "@/pages/devices/commands/new/resolvers";

vi.mock("react-i18next", () => createI18nMock({}));
const driver = {
  id: "driver",
  attributes: [{ name: "setpoint", data_type: "float", read: {}, write: {} }],
} as Driver;
const device = (id: string, value: number | null): Device => ({
  id,
  name: id,
  driver_id: "driver",
  transport_id: "transport",
  config: {},
  attributes: {
    setpoint: {
      name: "setpoint",
      data_type: "float",
      current_value: value,
      read_write_modes: ["read", "write"],
    },
  },
});

describe("group reported values", () => {
  it.each([
    [[21, 21], 2, "common", 21, 0],
    [[20, 22], 2, "multiple", null, 0],
    [[21, null], 2, "partial", null, 1],
    [[21], 2, "partial", null, 1],
    [[null, null], 2, "unavailable", null, 2],
    [[], 0, "unavailable", null, 0],
  ] as const)(
    "aggregates %j across %i members",
    (values, count, state, value, missing) => {
      const devices = values.map((v, i) => device(String(i), v));
      const attr = aggregateGroupAttributes(driver, devices, count).setpoint;
      expect(attr).toMatchObject({ state, current_value: value, missing });
      if (devices.length === count)
        expect(currentValueFor(devices, "setpoint")).toBe(
          state === "common" ? value : undefined,
        );
    },
  );

  it("requires an absolute target for mixed values and never changes reported values", () => {
    const attributes = aggregateGroupAttributes(
      driver,
      [device("a", 20), device("b", 22)],
      2,
    );
    const prepare = vi.fn();
    const choose = vi.fn();
    const { result } = renderHook(() =>
      useGroupRuntime(
        attributes,
        {
          setpoint: {
            attribute: "setpoint",
            kind: "number",
            label: { default: "Setpoint" },
          },
        },
        true,
        prepare,
        choose,
      ),
    );
    result.current.activate({ control: "setpoint", op: "increment" });
    expect(choose).toHaveBeenCalledWith("setpoint");
    expect(prepare).not.toHaveBeenCalled();
    result.current.setValue("setpoint", 24);
    expect(prepare).toHaveBeenCalledWith("setpoint", 24);
    expect(result.current.reported("setpoint")).toBeNull();
  });

  it("keeps tag and driver criteria dynamic and intersects explicit IDs", () => {
    const target = targetFilterToDevicesFilter({
      driverId: "driver",
      ids: ["b"],
      tags: { ecs: ["east"] },
    });
    expect(target.driver_id).toBe("driver");
    const devices = [device("a", 20), device("b", 20)].map((d) => ({
      ...d,
      tags: { ecs: ["east", "west"] },
    }));
    expect(resolveFilter(devices, target).map((d) => d.id)).toEqual(["b"]);
    expect(
      resolveFilter(devices, { ...target, tags: { ecs: ["missing"] } }),
    ).toEqual([]);
    expect(resolveFilter(devices, { ...target, driver_id: "missing" })).toEqual(
      [],
    );
  });

  it("steps from an explicit draft while mixed reported values remain unknown", () => {
    const attributes = aggregateGroupAttributes(
      driver,
      [device("a", 20), device("b", 22)],
      2,
    );
    attributes.setpoint.write_state = {
      status: "ready",
      constraints: {
        step: 0.5,
        minimum: 16,
        maximum: 28,
      },
    };
    const stage = vi.fn();
    const { result } = renderHook(() =>
      useGroupRuntime(
        attributes,
        {
          setpoint: {
            attribute: "setpoint",
            kind: "number",
            label: { default: "Setpoint" },
          },
        },
        true,
        stage,
        vi.fn(),
        { setpoint: 24 },
      ),
    );

    expect(result.current.readControl("setpoint")).toMatchObject({
      displayed: 24,
      reported: null,
      canIncrement: true,
    });
    result.current.activate({ control: "setpoint", op: "increment" });
    expect(stage).toHaveBeenCalledWith("setpoint", 24.5);
    expect(result.current.reported("setpoint")).toBeNull();
    expect(result.current.valueLabel?.("setpoint")).toBe(
      "groups.values.multiple",
    );
  });
});

const presentation: PresentationV1 = {
  schema_version: 1,
  requires: [],
  assets: {},
  bindings: { target: { attribute: "setpoint" } },
  controls: {},
  page: {
    kind: "variant",
    variants: [
      {
        when: { op: "eq", binding: "target", value: 20 },
        content: { kind: "attributes" },
      },
      {
        when: { op: "is_known", binding: "target" },
        content: { kind: "attributes" },
      },
    ],
  },
};

it("judges a condition true for the group when one member reaches it", () => {
  const judge = groupJudge([device("a", 20), device("b", null)]);
  const eq = { op: "eq", binding: "setpoint", value: 20 } as const;
  expect(judge(eq, "true")).toBe(true);
  expect(judge(eq, "false")).toBe(false);
  expect(groupJudge([device("b", null)])(eq, "true")).toBe(false);
  expect(groupJudge([])(eq, "true")).toBe(false);
  expect(groupJudge([device("a", 21), device("b", null)])(eq, "false")).toBe(
    true,
  );
});

it("uses the generic group layout when members select different variants", () => {
  expect(layoutsAgree(presentation, [device("a", 20), device("b", 21)])).toBe(
    false,
  );
  expect(layoutsAgree(presentation, [device("a", 20), device("b", 20)])).toBe(
    true,
  );
  expect(layoutsAgree(presentation, [])).toBe(true);
});
