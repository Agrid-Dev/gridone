import { isPmsMonitor, readPmsMonitorAttributes } from "@/lib/devices";
import { EMPTY_LEAD } from "../fleet-lead";
import type { FleetLeadContext, FleetLeadOf } from "../types";

/** The room's reservation status in words — the only toned one being an
 *  occupied room — then who is in it or when the next guest arrives. */
export const pmsMonitorFleetLead: FleetLeadOf = (device, ctx) => {
  if (!isPmsMonitor(device)) return EMPTY_LEAD;
  const { reservationStatus, guestCount, nextArrivalAt } =
    readPmsMonitorAttributes(device);
  return {
    primary: {
      value: reservationStatusLabel(reservationStatus, ctx),
      tone: reservationStatus === "checked_in" ? "text-primary" : undefined,
    },
    secondary: {
      value: reservationDetail(
        reservationStatus,
        guestCount,
        nextArrivalAt,
        ctx,
      ),
    },
  };
};

function reservationDetail(
  status: string | null,
  guestCount: number | null,
  nextArrivalAt: string | null,
  { t, locale }: FleetLeadContext,
): string {
  if (status === "checked_in") {
    return guestCount == null
      ? t("devices.card.pms.guestCountUnavailable")
      : t("devices.card.pms.guests", { count: guestCount });
  }
  const arrival = formatArrival(nextArrivalAt, locale);
  return arrival
    ? t("devices.card.pms.nextArrival", { date: arrival })
    : t("devices.card.pms.noUpcomingArrival");
}

function reservationStatusLabel(
  status: string | null,
  { t }: FleetLeadContext,
): string {
  switch (status) {
    case "booked":
      return t("devices.card.pms.status.booked");
    case "checked_in":
      return t("devices.card.pms.status.checkedIn");
    case "checked_out":
      return t("devices.card.pms.status.checkedOut");
    case null:
      return t("devices.card.pms.status.unknown");
    default: {
      const label = status.split("_").join(" ");
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
  }
}

function formatArrival(value: string | null, locale: string): string | null {
  if (!value) return null;
  const arrival = new Date(value);
  if (Number.isNaN(arrival.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(arrival);
}
