import { FC, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TypographyH3 } from "@/components/ui/typography";
import { Skeleton } from "@/components/ui/skeleton";
import { DeviceFleetCard } from "@/pages/devices/DeviceFleetCard";
import { useDevicesList } from "@/hooks/useDevicesList";
import { useDeviceZonePath } from "@/hooks/useDeviceZonePath";
import { sortedByName } from "@/lib/sortByName";

/** Lists the devices bound to `driverId`, with the same card as the
 *  devices list (`DeviceFleetCard`).
 *  Filtering is done server-side via the `driver_id` device filter. */
export const DriverDevicesSection: FC<{ driverId: string }> = ({
  driverId,
}) => {
  const { t } = useTranslation("drivers");
  const filter = useMemo(() => ({ driver_id: driverId }), [driverId]);
  const { devices, loading, error } = useDevicesList(filter);
  const zonePathOf = useDeviceZonePath();

  const sorted = useMemo(() => sortedByName(devices), [devices]);

  return (
    <section>
      <TypographyH3>
        {t("devicesSection.title")}
        {!loading && !error && ` (${sorted.length})`}
      </TypographyH3>
      <div className="mt-4">
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-48" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-muted-foreground">
            {t("devicesSection.error")}
          </p>
        ) : sorted.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sorted.map((device) => (
              <DeviceFleetCard
                key={device.id}
                device={device}
                zonePath={zonePathOf(device)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("devicesSection.empty")}
          </p>
        )}
      </div>
    </section>
  );
};
