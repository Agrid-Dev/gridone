import { useTranslation } from "react-i18next";
import type { Device } from "@gridone/sdk";
import {
  deviceTypeKey,
  deviceTypeKeyIcon,
  deviceTypeName,
  OTHER_KEY,
} from "@/lib/deviceTypes";
import { cn } from "@/lib/utils";
import type { FleetActivity } from "./fleet-status";

/** Tile outline and pictogram tone per activity — monochrome: the mode's
 *  colour belongs to the status line, never to the drawing. Literal classes
 *  so Tailwind keeps them. */
const ACTIVITY_CLASS: Record<FleetActivity, { tile: string; icon: string }> = {
  active: { tile: "border-border", icon: "text-foreground" },
  idle: { tile: "border-border", icon: "text-muted-foreground/70" },
  unknown: {
    tile: "border-dashed border-muted-foreground/40",
    icon: "text-muted-foreground/50",
  },
};

/**
 * The device's type as a pictogram on a small tile, at the head of its fleet
 * card. The tile says what the device is; its tone says whether it is active,
 * idle, or reporting nothing to judge by (dashed). Named after the type — the
 * state is written out elsewhere on the card.
 */
export function FleetTypeTile({
  device,
  activity,
}: {
  device: Device;
  activity: FleetActivity;
}) {
  const { t } = useTranslation("standardDevices");
  const Icon = deviceTypeKeyIcon(deviceTypeKey(device));
  const label = deviceTypeName(device.type, t) ?? t(`${OTHER_KEY}.name`);
  const { tile, icon } = ACTIVITY_CLASS[activity];

  return (
    <span
      role="img"
      aria-label={label}
      data-activity={activity}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md border bg-card",
        tile,
      )}
    >
      <Icon className={cn("size-[18px]", icon)} strokeWidth={1.5} />
    </span>
  );
}
