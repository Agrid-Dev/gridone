import type { Device } from "@gridone/sdk";
import { deviceTypeKey, deviceTypeKeyIcon } from "@/lib/deviceTypes";
import { cn } from "@/lib/utils";
import type { FleetActivity } from "./fleet-status";

/** Tile outline and pictogram tone per activity — monochrome: the mode's
 *  colour belongs to the status line, never to the drawing. Literal classes
 *  so Tailwind keeps them. */
const ACTIVITY_CLASS: Record<FleetActivity, { tile: string; icon: string }> = {
  running: { tile: "border-border", icon: "text-foreground" },
  reporting: { tile: "border-border", icon: "text-foreground" },
  idle: { tile: "border-border", icon: "text-muted-foreground/70" },
  unknown: {
    tile: "border-dashed border-muted-foreground/40",
    icon: "text-muted-foreground/50",
  },
};

/**
 * The device's type as a pictogram on a small tile, at the head of its fleet
 * card. Its tone says whether the device runs or reports, stands idle, or
 * gives nothing to judge by (dashed). Decorative: the card writes the type
 * out beside it.
 */
export function FleetTypeTile({
  device,
  activity,
}: {
  device: Device;
  activity: FleetActivity;
}) {
  const Icon = deviceTypeKeyIcon(deviceTypeKey(device));
  const { tile, icon } = ACTIVITY_CLASS[activity];

  return (
    <span
      aria-hidden
      data-activity={activity}
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-md border bg-card",
        tile,
      )}
    >
      <Icon className={cn("size-[22px]", icon)} strokeWidth={1.5} />
    </span>
  );
}
