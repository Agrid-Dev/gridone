import { describe, expect, it } from "vitest";
import type { Device } from "@gridone/sdk";
import { DeviceType } from "@/lib/devices";
import {
  fleetCardStatus,
  fleetGroupCounts,
  type FleetCardStatus,
} from "./fleetCardStatus";

type Severity = "alert" | "warning" | "info";

/** A device of `type` reporting `attributes`, with an active fault of
 *  `severity` and a `connection_status` when given. */
function device(
  type: string,
  attributes: Record<string, unknown>,
  { severity, connection }: { severity?: Severity; connection?: string } = {},
): Device {
  const standard = Object.entries({
    ...attributes,
    ...(connection ? { connection_status: connection } : {}),
  }).map(([name, value]) => [
    name,
    { name, kind: "standard", current_value: value },
  ]);
  const faults = severity
    ? [
        [
          "some_fault",
          {
            name: "some_fault",
            kind: "fault",
            severity,
            is_faulty: true,
            current_value: true,
          },
        ],
      ]
    : [];
  return {
    id: "d1",
    name: "Device",
    type,
    tags: {},
    driver_id: "drv",
    transport_id: "tr",
    config: {},
    is_faulty: Boolean(severity),
    attributes: Object.fromEntries([...standard, ...faults]),
  } as unknown as Device;
}

/** What each device reports, and whether it is a unit that runs. */
const STATES = {
  "running thermostat": [
    DeviceType.Thermostat,
    { onoff_state: true, mode: "heat" },
  ],
  "stopped thermostat": [
    DeviceType.Thermostat,
    { onoff_state: false, mode: "heat" },
  ],
  "thermostat reporting no run state": [
    DeviceType.Thermostat,
    { temperature: 21 },
  ],
  "running pump": [DeviceType.Pump, { onoff_state: true }],
  "reporting meter": [DeviceType.ElectricityMeter, { active_power: 240 }],
  "silent meter": [DeviceType.ElectricityMeter, {}],
} as const satisfies Record<string, readonly [string, Record<string, unknown>]>;

describe("fleetCardStatus", () => {
  it.each<
    [
      string,
      keyof typeof STATES,
      { severity?: Severity; connection?: string },
      Partial<FleetCardStatus>,
    ]
  >([
    [
      "a running unit is outlined in green",
      "running thermostat",
      { connection: "ok" },
      {
        activity: "running",
        outline: "running",
        connection: null,
        stale: false,
      },
    ],
    [
      "a running pump too, though its lead words the state",
      "running pump",
      {},
      { activity: "running", outline: "running", runStatus: null },
    ],
    [
      "a stopped unit keeps the hairline",
      "stopped thermostat",
      {},
      { activity: "idle", outline: null },
    ],
    [
      "a reporting sensor keeps the hairline: it has nothing to run",
      "reporting meter",
      {},
      { activity: "reporting", outline: null },
    ],
    [
      "a fault wins over the green",
      "running thermostat",
      { severity: "warning" },
      { activity: "running", outline: "warning" },
    ],
    [
      "a stopped unit's fault is outlined too",
      "stopped thermostat",
      { severity: "info" },
      { outline: "info" },
    ],
    [
      "a degraded link is named, and the unit still runs",
      "running thermostat",
      { connection: "degraded" },
      {
        connection: "degraded",
        stale: false,
        activity: "running",
        outline: "running",
      },
    ],
    [
      "a disconnected unit is stale: neither running nor stopped, no status line",
      "running thermostat",
      { connection: "error" },
      {
        connection: "error",
        stale: true,
        activity: "unknown",
        runStatus: null,
        outline: null,
      },
    ],
    [
      "a disconnected unit keeps its fault's outline",
      "stopped thermostat",
      { connection: "error", severity: "alert" },
      { stale: true, activity: "unknown", outline: "alert" },
    ],
    [
      "a device waiting for its first reading is not named",
      "running thermostat",
      { connection: "idle" },
      { connection: null, stale: false, outline: "running" },
    ],
  ])("%s", (_, state, extra, expected) => {
    const [type, attributes] = STATES[state];
    expect(
      fleetCardStatus(device(type, attributes, extra), true),
    ).toMatchObject(expected);
  });

  it("reads every device as connected for a viewer who may not see it", () => {
    const [type, attributes] = STATES["running thermostat"];
    expect(
      fleetCardStatus(device(type, attributes, { connection: "error" }), false),
    ).toMatchObject({
      connection: null,
      stale: false,
      activity: "running",
      outline: "running",
      runStatus: { run: "running", mode: "heat" },
    });
  });

  describe("over every state, fault, connection and viewer", () => {
    const severities = [undefined, "info", "warning", "alert"] as const;
    const connections = [undefined, "idle", "ok", "degraded", "error"] as const;
    const cases = Object.entries(STATES).flatMap(
      ([state, [type, attributes]]) =>
        severities.flatMap((severity) =>
          connections.flatMap((connection) =>
            [true, false].map((canSee) => ({
              label: `${state}, fault ${severity ?? "none"}, connection ${connection ?? "none"}, sees ${canSee}`,
              state,
              severity,
              connection,
              canSee,
              status: fleetCardStatus(
                device(type, attributes, { severity, connection }),
                canSee,
              ),
            })),
          ),
        ),
    );

    it("has cases to sweep", () => {
      expect(cases).toHaveLength(6 * 4 * 5 * 2);
    });

    it("gives the outline to a fault, whatever else holds", () => {
      const wrong = cases.filter(
        ({ severity, status }) => severity && status.outline !== severity,
      );
      expect(wrong.map(({ label }) => label)).toEqual([]);
    });

    it("is green only for a unit that runs, live, with no fault", () => {
      const green = cases.filter(({ status }) => status.outline === "running");
      const wrong = green.filter(
        ({ state, severity, status }) =>
          !["running thermostat", "running pump"].includes(state) ||
          severity ||
          status.stale,
      );
      expect(wrong.map(({ label }) => label)).toEqual([]);
      // …and every such unit is green.
      expect(green).toHaveLength(
        cases.filter(
          ({ state, severity, connection, canSee }) =>
            ["running thermostat", "running pump"].includes(state) &&
            !severity &&
            !(canSee && connection === "error"),
        ).length,
      );
    });

    it("names the connection only when it went wrong, and only to those allowed", () => {
      const wrong = cases.filter(({ connection, canSee, status }) => {
        const named =
          canSee && (connection === "degraded" || connection === "error")
            ? connection
            : null;
        return status.connection !== named;
      });
      expect(wrong.map(({ label }) => label)).toEqual([]);
    });

    it("goes stale exactly when a viewer allowed to see it would read disconnected", () => {
      const wrong = cases.filter(
        ({ connection, canSee, status }) =>
          status.stale !== (canSee && connection === "error"),
      );
      expect(wrong.map(({ label }) => label)).toEqual([]);
    });

    it("claims no activity and no status line for a stale card", () => {
      const wrong = cases.filter(
        ({ status }) =>
          status.stale &&
          (status.activity !== "unknown" || status.runStatus !== null),
      );
      expect(wrong.map(({ label }) => label)).toEqual([]);
    });
  });
});

describe("fleetGroupCounts", () => {
  const status = (overrides: Partial<FleetCardStatus>): FleetCardStatus => ({
    activity: "running",
    runStatus: null,
    connection: null,
    stale: false,
    faults: null,
    outline: "running",
    ...overrides,
  });

  it("counts running, stopped, disconnected and faulty cards", () => {
    expect(
      fleetGroupCounts([
        status({}),
        status({}),
        status({ faults: { severity: "warning", count: 1 } }),
        status({ activity: "idle", outline: null }),
        status({ activity: "unknown", stale: true, outline: null }),
        status({ activity: "reporting", outline: null }),
      ]),
    ).toEqual({
      running: 3,
      stopped: 1,
      disconnected: 1,
      faulty: 1,
      severity: "warning",
    });
  });

  it("colours the fault count by the most severe fault of the group", () => {
    expect(
      fleetGroupCounts([
        status({ faults: { severity: "info", count: 2 } }),
        status({ faults: { severity: "alert", count: 1 } }),
        status({ faults: { severity: "warning", count: 1 } }),
      ]),
    ).toMatchObject({ faulty: 3, severity: "alert" });
  });

  it("counts nothing in an empty group", () => {
    expect(fleetGroupCounts([])).toEqual({
      running: 0,
      stopped: 0,
      disconnected: 0,
      faulty: 0,
      severity: null,
    });
  });
});
