import { type FC, useMemo } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronRight, Cpu } from "lucide-react";
import { Card } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDevicesList } from "@/hooks/useDevicesList";
import { useAssetTree } from "@/hooks/useAssetTree";
import { deviceTypeIcon } from "@/lib/deviceTypes";
import { sortedByName } from "@/lib/sortByName";

/** Dense list of the devices bound to a network, matching the network-detail
 *  information-card pattern while retaining direct links to each device. */
export const TransportDevicesSection: FC<{ transportId: string }> = ({
  transportId,
}) => {
  const { t } = useTranslation(["transports", "common"]);
  const filter = useMemo(() => ({ transport_id: transportId }), [transportId]);
  const { devices, loading, error } = useDevicesList(filter);
  const { assetByDeviceId } = useAssetTree();
  const sorted = useMemo(() => sortedByName(devices), [devices]);

  return (
    <Card className="overflow-hidden rounded-xl">
      <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
        <h2 className="font-display text-base font-semibold">
          {t("devicesSection.title")}
        </h2>
        {!loading && !error && (
          <Badge variant="info" className="tabular-nums">
            {t("device", { count: sorted.length })}
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="space-y-px p-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-14" />
          ))}
        </div>
      ) : error ? (
        <p className="p-5 text-sm text-destructive">
          {t("devicesSection.error")}
        </p>
      ) : sorted.length > 0 ? (
        <div className="max-h-[30rem] divide-y overflow-y-auto">
          {sorted.map((device) => {
            const Icon = deviceTypeIcon(device.type) ?? Cpu;
            const asset = assetByDeviceId[device.id];
            return (
              <Link
                key={device.id}
                to={`/devices/${device.id}`}
                className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {device.name || device.id}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">
                    {device.driver_id}
                  </span>
                </span>
                {asset && (
                  <span className="hidden max-w-36 truncate text-xs text-muted-foreground sm:block">
                    {asset.name}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="px-5 py-10 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Cpu className="h-5 w-5" />
          </div>
          <p className="text-sm text-muted-foreground">
            {t("devicesSection.empty")}
          </p>
        </div>
      )}
    </Card>
  );
};
