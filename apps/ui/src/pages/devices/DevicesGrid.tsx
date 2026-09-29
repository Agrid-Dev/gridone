import type { Device } from "@gridone/sdk";
import { type DeviceTypeGroup } from "@/lib/deviceTypes";
import { DeviceFleetCard } from "./DeviceFleetCard";
import { DeviceGroupHeading, DeviceGroupSummary } from "./DeviceGroupHeading";

type DevicesGridProps = {
  groups: DeviceTypeGroup[];
  zonePathOf: (device: Device) => string | null;
};

/** The fleet grid: one section per type bucket, each a heading — with the
 *  states of its cards beside it — followed by a {@link DeviceFleetCard} per
 *  device. */
export function DevicesGrid({ groups, zonePathOf }: DevicesGridProps) {
  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section
          key={group.key}
          className="space-y-3"
          aria-labelledby={`device-group-${group.key}`}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <DeviceGroupHeading
              id={`device-group-${group.key}`}
              typeKey={group.key}
              count={group.devices.length}
            />
            <DeviceGroupSummary devices={group.devices} />
            <span className="h-px min-w-6 flex-1 bg-border" aria-hidden />
          </div>
          {/* An explicit single column below `sm`: an implicit one is sized
              to the cards' content, so a long type and location would push
              the card past the screen instead of truncating. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
