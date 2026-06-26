import { afterEach, describe, it, expect, vi } from "vitest";
import { applyDeviceUpdate } from "./socket";
import { DeviceKind, type Device, type DeviceAttribute } from "@/api/devices";

const attribute = (over: Partial<DeviceAttribute>): DeviceAttribute => ({
  kind: "standard",
  name: "temperature",
  dataType: "float",
  readWriteModes: ["read"],
  currentValue: 20,
  lastUpdated: "2026-01-01T00:00:00Z",
  lastChanged: "2026-01-01T00:00:00Z",
  ...over,
});

const device = (attrs: Record<string, DeviceAttribute>): Device => ({
  id: "d1",
  kind: DeviceKind.Physical,
  name: "Device 1",
  type: null,
  tags: {},
  driverId: "drv",
  transportId: "tr",
  config: {},
  attributes: attrs,
  isFaulty: false,
});

afterEach(() => {
  vi.useRealTimers();
});

describe("applyDeviceUpdate", () => {
  it("applies the value with the message's lastUpdated and lastChanged", () => {
    const updated = applyDeviceUpdate(
      device({ temperature: attribute({}) }),
      "temperature",
      21.5,
      "2026-06-26T10:00:00Z",
      "2026-06-26T09:00:00Z",
    );

    const attr = updated.attributes.temperature;
    expect(attr.currentValue).toBe(21.5);
    expect(attr.lastUpdated).toBe("2026-06-26T10:00:00Z");
    expect(attr.lastChanged).toBe("2026-06-26T09:00:00Z");
  });

  it("defaults lastChanged to lastUpdated when only lastUpdated is sent", () => {
    const updated = applyDeviceUpdate(
      device({ temperature: attribute({}) }),
      "temperature",
      21.5,
      "2026-06-26T10:00:00Z",
    );

    expect(updated.attributes.temperature.lastChanged).toBe(
      "2026-06-26T10:00:00Z",
    );
  });

  it("falls back to receive time when no timestamps are sent", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-26T12:00:00Z"));

    const updated = applyDeviceUpdate(
      device({ temperature: attribute({}) }),
      "temperature",
      21.5,
    );

    const now = "2026-06-26T12:00:00.000Z";
    expect(updated.attributes.temperature.lastUpdated).toBe(now);
    expect(updated.attributes.temperature.lastChanged).toBe(now);
  });

  it("returns the device untouched when the attribute is unknown", () => {
    const original = device({ temperature: attribute({}) });
    expect(applyDeviceUpdate(original, "unknown", 1, "ts")).toBe(original);
  });
});
