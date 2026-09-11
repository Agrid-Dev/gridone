import { describe, it, expect } from "vitest";
import type { Device } from "@gridone/sdk";
import type { DeviceAttribute } from "@/lib/devices";
import { resolveFilter, targetFilterToDevicesFilter } from "./resolvers";

function device(
  attributes: DeviceAttribute[],
  overrides?: Partial<Device>,
): Device {
  return {
    id: "d1",
    name: "Device",
    type: null,
    driver_id: "drv",
    transport_id: "trp",
    config: {},
    tags: {},
    is_faulty: false,
    attributes: Object.fromEntries(
      attributes.map((a) => [a.name as string, a]),
    ),
    ...overrides,
  };
}

describe("targetFilterToDevicesFilter", () => {
  // Regression: the wizard used to pass the form-state ``{assetId}`` shape
  // straight into resolveFilter (which reads ``asset_id``), so the asset
  // constraint silently no-oped in the filters-mode preview.
  it("maps the form-state assetId onto asset_id so the preview applies it", () => {
    const inAsset = device([], {
      id: "in",
      type: "thermostat",
      tags: { asset_id: "a1" },
    });
    const outOfAsset = device([], {
      id: "out",
      type: "thermostat",
      tags: { asset_id: "a2" },
    });

    const filter = targetFilterToDevicesFilter({ assetId: "a1" });
    expect(filter).toEqual({ types: undefined, asset_id: "a1" });

    const resolved = resolveFilter([inAsset, outOfAsset], filter);
    expect(resolved.map((d) => d.id)).toEqual(["in"]);
  });
});
