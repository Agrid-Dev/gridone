import { FC, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TypographyH3 } from "@/components/ui/typography";
import { Skeleton } from "@/components/ui/skeleton";
import { DeviceCard } from "@/pages/devices/DeviceCard";
import { useDevicesList } from "@/hooks/useDevicesList";
import { sortedByName } from "@/lib/sortByName";

/** Lists the devices bound to `transportId`, reusing the device-list
 *  `DeviceCard`. Filtering is done server-side via the `transport_id` filter. */
export const TransportDevicesSection: FC<{ transportId: string }> = ({
  transportId,
}) => {
  const { t } = useTranslation("transports");
  const filter = useMemo(() => ({ transportId }), [transportId]);
  const { devices, loading, error } = useDevicesList(filter);

  const sorted = useMemo(() => sortedByName(devices), [devices]);

  return (
    <section>
      <TypographyH3>
        {t("devicesSection.title")}
        {!loading && !error && ` (${sorted.length})`}
      </TypographyH3>
      <div className="mt-4">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-48" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-muted-foreground">
            {t("devicesSection.error")}
          </p>
        ) : sorted.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sorted.map((device) => (
              <DeviceCard key={device.id} device={device} />
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
