import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import type { Device } from "@gridone/sdk";
import { DeviceType } from "@/lib/devices";
import {
  countDevicesByType,
  DEVICE_TYPE_ORDER,
  deviceTypeBucketLabel,
  deviceTypeKey,
  deviceTypeKeyIcon,
  deviceTypeLabel,
  groupDevicesByType,
  OTHER_KEY,
} from "./deviceTypes";

function device(id: string, name: string, type: string | null): Device {
  return {
    id,
    name,
    type,
    driver_id: "drv",
    transport_id: "tr",
    config: {},
  } as Device;
}

const tSpy = ((key: string) => key) as unknown as TFunction<"standardDevices">;

describe("deviceTypeKey", () => {
  it("returns the standard type when known", () => {
    expect(deviceTypeKey(device("d1", "A", "thermostat"))).toBe(
      DeviceType.Thermostat,
    );
  });

  it.each([null, "custom_vendor_type"])("buckets %s under other", (type) => {
    expect(deviceTypeKey(device("d1", "A", type))).toBe(OTHER_KEY);
  });
});

describe("countDevicesByType", () => {
  it("tallies per bucket, unknown and untyped together under other", () => {
    const counts = countDevicesByType([
      device("d1", "A", "thermostat"),
      device("d2", "B", "thermostat"),
      device("d3", "C", "electricity_meter"),
      device("d4", "D", null),
      device("d5", "E", "custom"),
    ]);
    expect(counts.get(DeviceType.Thermostat)).toBe(2);
    expect(counts.get(DeviceType.ElectricityMeter)).toBe(1);
    expect(counts.get(OTHER_KEY)).toBe(2);
    expect(counts.get(DeviceType.Awhp)).toBeUndefined();
  });
});

describe("groupDevicesByType", () => {
  it("orders buckets canonically with other last, regardless of input order", () => {
    const groups = groupDevicesByType([
      device("d1", "A", null),
      device("d2", "B", "electricity_meter"),
      device("d3", "C", "thermostat"),
    ]);
    expect(groups.map((g) => g.key)).toEqual([
      DeviceType.Thermostat,
      DeviceType.ElectricityMeter,
      OTHER_KEY,
    ]);
  });

  it("omits empty buckets", () => {
    const groups = groupDevicesByType([device("d1", "A", "thermostat")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe(DeviceType.Thermostat);
  });

  it("sorts devices by name (case-insensitive) within a bucket", () => {
    const groups = groupDevicesByType([
      device("d1", "chambre 12", "thermostat"),
      device("d2", "Atrium", "thermostat"),
      device("d3", "bureau", "thermostat"),
    ]);
    expect(groups[0].devices.map((d) => d.name)).toEqual([
      "Atrium",
      "bureau",
      "chambre 12",
    ]);
  });
});

describe("deviceTypeKeyIcon", () => {
  it("resolves an icon for every canonical bucket", () => {
    for (const key of DEVICE_TYPE_ORDER) {
      expect(deviceTypeKeyIcon(key)).toBeDefined();
    }
  });

  it("gives other its own icon, distinct from the unknown-type fallback", () => {
    expect(deviceTypeKeyIcon(OTHER_KEY)).not.toBe(
      deviceTypeKeyIcon(DeviceType.Thermostat),
    );
  });
});

describe("deviceTypeLabel", () => {
  it("uses the singular form at exactly one", () => {
    expect(deviceTypeLabel(DeviceType.Thermostat, 1, tSpy)).toBe(
      "thermostat.name",
    );
  });

  it.each([0, 2])("uses the plural form at %d", (count) => {
    expect(deviceTypeLabel(DeviceType.Thermostat, count, tSpy)).toBe(
      "thermostat.name_plural",
    );
  });

  it("labels the other bucket from its own catalog entry", () => {
    expect(deviceTypeLabel(OTHER_KEY, 3, tSpy)).toBe("other.name_plural");
  });
});

describe("deviceTypeBucketLabel", () => {
  it("always uses the plural form — it names the category, not a quantity", () => {
    expect(deviceTypeBucketLabel(DeviceType.Thermostat, tSpy)).toBe(
      "thermostat.name_plural",
    );
    expect(deviceTypeBucketLabel(OTHER_KEY, tSpy)).toBe("other.name_plural");
  });
});
