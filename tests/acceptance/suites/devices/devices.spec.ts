import type { Device, GridoneClient } from "@gridone/sdk";
import { beforeAll, describe, expect, inject, it } from "vitest";
import { makeAdminClient, pollUntil } from "../../lib/api";

const deviceIds = inject("deviceIds");

// Timeseries queries start here so re-runs against a non-fresh stack only
// look at points produced by this run.
const runStart = new Date().toISOString();

let client: GridoneClient;

beforeAll(async () => {
  client = await makeAdminClient();
});

// The generated wire type keeps attribute payloads open
// (`Attribute: { [key: string]: unknown }`), so narrow here.
function currentValue(device: Device, attribute: string): unknown {
  const attr = device.attributes?.[attribute] as
    | { current_value?: unknown }
    | undefined;
  return attr?.current_value ?? null;
}

type Written = string | number | boolean;

// One command per data type: float setpoint, on/off switch, string mode.
// Targets derive from the current value so they always change something,
// even on re-runs against a non-fresh stack.
const COMMANDS: {
  attribute: string;
  pick: (current: unknown) => Written;
}[] = [
  {
    attribute: "temperature_setpoint",
    pick: (current) => (current === 24 ? 25 : 24),
  },
  { attribute: "state", pick: (current) => current !== true },
  {
    attribute: "mode",
    pick: (current) => (current === "heat" ? "cool" : "heat"),
  },
];

it("lists the seeded devices", async () => {
  const devices = await client.devices.list();

  const ids = devices.map((device) => device.id);
  expect(ids).toEqual(expect.arrayContaining(deviceIds));
});

// Golden path per seeded device: read the live snapshot, command every data
// type, then verify both histories. The steps run in declaration order and
// the history steps assert on what the command step recorded in `written`.
describe.each(deviceIds.map((id, index) => ({ id, index })))(
  "seeded device $index",
  ({ id }) => {
    const written = new Map<string, { value: Written; commandId: number }>();

    it("reads attribute values from the emulator", async () => {
      const device = await pollUntil(
        () => client.devices.get(id),
        (d) => currentValue(d, "temperature") != null,
        { description: `device ${id} temperature to be read` },
      );

      expect(typeof currentValue(device, "temperature")).toBe("number");
      expect(typeof currentValue(device, "temperature_setpoint")).toBe(
        "number",
      );
      expect(typeof currentValue(device, "state")).toBe("boolean");
      expect(typeof currentValue(device, "mode")).toBe("string");
      expect(typeof currentValue(device, "fan_speed")).toBe("string");
    });

    it.each(COMMANDS)(
      "commands $attribute and reads the confirmed state back",
      async ({ attribute, pick }) => {
        const before = await client.devices.get(id);
        const target = pick(currentValue(before, attribute));

        const command = await client.devices.sendCommand(id, {
          attribute,
          value: target,
          confirm: true,
        });

        expect(command.device_id).toBe(id);
        expect(command.status).toBe("success");
        expect(command.value).toBe(target);

        // Commands execute synchronously: a plain read reflects the write.
        const after = await client.devices.get(id);
        expect(currentValue(after, attribute)).toBe(target);

        written.set(attribute, { value: target, commandId: command.id });
      },
    );

    it("recorded the written values as timeseries points", async () => {
      expect(written.size).toBe(COMMANDS.length);

      const series = await client.timeseries.list(id);
      const metrics = series.map((s) => s.metric);
      expect(metrics).toEqual(expect.arrayContaining([...written.keys()]));

      for (const [attribute, { value, commandId }] of written) {
        // Recording is asynchronous — poll for the point, then check that it
        // links back to the command that produced it.
        const result = await pollUntil(
          () => client.timeseries.getPoints(id, attribute, { start: runStart }),
          (r) => r.points.some((point) => point.value === value),
          {
            timeoutMs: 15_000,
            description: `a ${attribute} point with value ${value}`,
          },
        );

        const point = result.points.find((p) => p.value === value);
        expect(point?.command_id).toBe(commandId);
      }
    });

    it("stored the commands in the command history", async () => {
      expect(written.size).toBe(COMMANDS.length);

      const history = await client.devices.listCommands({ device_id: id });

      for (const [attribute, { value, commandId }] of written) {
        const match = history.items.find((c) => c.id === commandId);
        expect(match, `command ${commandId} (${attribute})`).toBeDefined();
        expect(match?.attribute).toBe(attribute);
        expect(match?.value).toBe(value);
        expect(match?.status).toBe("success");
      }
    });
  },
);
