import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import type { Device } from "@gridone/sdk";
import { useCanSeeConnectionStatus } from "@/hooks/useCanSeeConnectionStatus";
import {
  deviceTypeBucketLabel,
  deviceTypeKeyIcon,
  type DeviceTypeKey,
} from "@/lib/deviceTypes";
import { SEVERITY_TEXT_CLASS } from "@/lib/severity";
import { cn } from "@/lib/utils";
import { fleetCardStatus, fleetGroupCounts } from "./fleetCardStatus";

/** The label and count of one fleet type bucket ("Thermostats 42"). */
export function DeviceGroupHeading({
  typeKey,
  count,
  id,
}: {
  typeKey: DeviceTypeKey;
  count: number;
  /** Set by the grid so its section can be labelled by this heading. */
  id?: string;
}) {
  const { t: tTypes } = useTranslation("standardDevices");
  const Icon = deviceTypeKeyIcon(typeKey);

  return (
    <span
      id={id}
      className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-foreground"
    >
      <Icon className="size-4" strokeWidth={1.75} aria-hidden />
      {deviceTypeBucketLabel(typeKey, tTypes)}
      <span className="font-medium tabular-nums text-muted-foreground">
        {count}
      </span>
    </span>
  );
}

/**
 * "6 en marche · 1 à l'arrêt · 1 déconnecté · 1 en défaut" — the states of a
 * type group's cards, beside its heading. Zero counts are left out, and so is
 * the whole line for a single device, whose card says it all; disconnected
 * and faulty counts take their status colour. On a narrow screen the line
 * moves under the heading, full width, and wraps between counts rather than
 * being cut: the counts that matter most come last.
 */
export function DeviceGroupSummary({ devices }: { devices: Device[] }) {
  const { t } = useTranslation("devices");
  const canSeeConnectionStatus = useCanSeeConnectionStatus();
  if (devices.length < 2) return null;
  const counts = fleetGroupCounts(
    devices.map((device) => fleetCardStatus(device, canSeeConnectionStatus)),
  );
  const parts = [
    {
      key: "running",
      count: counts.running,
      text: t("devices.group.running", { count: counts.running }),
    },
    {
      key: "stopped",
      count: counts.stopped,
      text: t("devices.group.stopped", { count: counts.stopped }),
    },
    {
      key: "disconnected",
      count: counts.disconnected,
      text: t("devices.summary.error", { count: counts.disconnected }),
      className: "font-medium text-status-error",
    },
    {
      key: "faulty",
      count: counts.faulty,
      text: t("devices.group.faulty", { count: counts.faulty }),
      className: cn(
        "font-medium",
        counts.severity && SEVERITY_TEXT_CLASS[counts.severity],
      ),
    },
  ].filter((part) => part.count > 0);
  if (parts.length === 0) return null;

  return (
    <span className="order-last w-full text-xs text-muted-foreground sm:order-none sm:w-auto sm:min-w-0">
      {parts.map((part, index) => (
        <Fragment key={part.key}>
          {index > 0 && " · "}
          <span className={cn("whitespace-nowrap", part.className)}>
            {part.text}
          </span>
        </Fragment>
      ))}
    </span>
  );
}
