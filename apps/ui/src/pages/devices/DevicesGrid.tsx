import type { Device } from "@gridone/sdk";
import { type DeviceTypeGroup } from "@/lib/deviceTypes";
import { DeviceFleetCard } from "./DeviceFleetCard";
import { DeviceGroupHeading } from "./DeviceGroupHeading";

type DevicesGridProps = {
  groups: DeviceTypeGroup[];
  zonePathOf: (device: Device) => string | null;
};

/** The fleet grid: one section per type bucket, each a heading followed by a
 *  {@link DeviceFleetCard} per device. Same buckets and order as
 *  {@link DevicesTable} — only the density differs. */
export function DevicesGrid({ groups, zonePathOf }: DevicesGridProps) {
  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section
          key={group.key}
          className="space-y-3"
          aria-labelledby={`device-group-${group.key}`}
        >
          <div className="flex items-center gap-3">
            <DeviceGroupHeading
              id={`device-group-${group.key}`}
              typeKey={group.key}
              count={group.devices.length}
            />
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {group.devices.map((device) => (
              <DeviceFleetCard
                key={device.id}
                device={device}
                zonePath={zonePathOf(device)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
