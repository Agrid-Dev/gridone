import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { BedDouble, CalendarClock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { readPmsMonitorAttributes, type PmsMonitorDevice } from "@/lib/devices";

/** Compact reservation summary used instead of an irrelevant numeric measure. */
export function PmsMonitorFleetSummary({
  device,
}: {
  device: PmsMonitorDevice;
}) {
  const { t, i18n } = useTranslation("devices");
  const { reservationStatus, guestCount, nextArrivalAt } =
    readPmsMonitorAttributes(device);
  const { DetailIcon, detail } = reservationDetail(
    reservationStatus,
    guestCount,
    nextArrivalAt,
    i18n.language,
    t,
  );

  return (
    <div className="flex items-center gap-3 py-0.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <BedDouble className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <Badge variant="secondary" className="max-w-full">
          <span className="truncate">
            {reservationStatusLabel(reservationStatus, t)}
          </span>
        </Badge>
        <p className="mt-1.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <DetailIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{detail}</span>
        </p>
      </div>
    </div>
  );
}

function reservationDetail(
  status: string | null,
  guestCount: number | null,
  nextArrivalAt: string | null,
  locale: string,
  t: TFunction<"devices">,
) {
  if (status === "checked_in") {
    return {
      DetailIcon: Users,
      detail:
        guestCount == null
          ? t("devices.card.pms.guestCountUnavailable")
          : t("devices.card.pms.guests", { count: guestCount }),
    };
  }

  const arrival = formatArrival(nextArrivalAt, locale);
  return {
    DetailIcon: CalendarClock,
    detail: arrival
      ? t("devices.card.pms.nextArrival", { date: arrival })
      : t("devices.card.pms.noUpcomingArrival"),
  };
}

function reservationStatusLabel(
  status: string | null,
  t: TFunction<"devices">,
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
