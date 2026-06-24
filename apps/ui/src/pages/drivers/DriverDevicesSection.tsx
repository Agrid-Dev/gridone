import { FC, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui";
import { TypographyH3 } from "@/components/ui/typography";
import { Skeleton } from "@/components/ui/skeleton";
import { DeviceCard } from "@/pages/devices/DeviceCard";
import { useDevicesList } from "@/hooks/useDevicesList";

/** Lists the devices bound to `driverId`, reusing the device-list `DeviceCard`.
 *  Filtering is done server-side via the `driver_id` device filter. */
export const DriverDevicesSection: FC<{ driverId: string }> = ({
  driverId,
}) => {
  const { t } = useTranslation("drivers");
  const filter = useMemo(() => ({ driverId }), [driverId]);
  const { devices, loading, error } = useDevicesList(filter);

  const sorted = useMemo(
    () =>
      [...devices].sort((a, b) =>
        (a.name || a.id).localeCompare(b.name || b.id, undefined, {
          sensitivity: "base",
        }),
      ),
    [devices],
  );

  return (
    <Card className="py-4">
      <CardContent>
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
      </CardContent>
    </Card>
  );
};
