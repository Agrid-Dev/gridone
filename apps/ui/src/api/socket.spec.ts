import { afterEach, describe, it, expect, vi } from "vitest";
import type { Device } from "@gridone/sdk";
import type { DeviceAttribute } from "@/lib/devices";
import { applyDeviceUpdate } from "./socket";

const attribute = (over: Partial<DeviceAttribute>): DeviceAttribute => ({
  kind: "standard",
  name: "temperature",
  data_type: "float",
  read_write_modes: ["read"],
  current_value: 20,
  last_updated: "2026-01-01T00:00:00Z",
  last_changed: "2026-01-01T00:00:00Z",
  ...over,
});

const device = (attrs: Record<string, DeviceAttribute>): Device => ({
  id: "d1",
  name: "Device 1",
  type: null,
  tags: {},
  driver_id: "drv",
  transport_id: "tr",
  config: {},
  attributes: attrs,
  is_faulty: false,
});

afterEach(() => {
  vi.useRealTimers();
});

describe("applyDeviceUpdate", () => {
  it("applies the value with the message's last_updated and last_changed", () => {
    const updated = applyDeviceUpdate(
      device({ temperature: attribute({}) }),
      "temperature",
      21.5,
      "2026-06-26T10:00:00Z",
      "2026-06-26T09:00:00Z",
    );

    const attr = updated.attributes!.temperature;
    expect(attr.current_value).toBe(21.5);
    expect(attr.last_updated).toBe("2026-06-26T10:00:00Z");
    expect(attr.last_changed).toBe("2026-06-26T09:00:00Z");
  });

  it("defaults last_changed to last_updated when only last_updated is sent", () => {
    const updated = applyDeviceUpdate(
      device({ temperature: attribute({}) }),
      "temperature",
      21.5,
      "2026-06-26T10:00:00Z",
    );

    expect(updated.attributes!.temperature.last_changed).toBe(
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
    expect(updated.attributes!.temperature.last_updated).toBe(now);
    expect(updated.attributes!.temperature.last_changed).toBe(now);
  });

  it("returns the device untouched when the attribute is unknown", () => {
    const original = device({ temperature: attribute({}) });
    expect(applyDeviceUpdate(original, "unknown", 1, "ts")).toBe(original);
  });
});
