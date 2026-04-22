import { Link, Outlet, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { useDevice } from "@/hooks/useDevice";
import { ChevronLeft, History, Pencil, Terminal } from "lucide-react";
import { ActiveFaultsSection } from "@/components/ActiveFaultsSection";
import { DeviceTypeChip } from "@/components/DeviceTypeChip";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { usePermissions } from "@/contexts/AuthContext";

export default function DeviceLayout() {
  const { t } = useTranslation("devices");
  const { deviceId } = useParams<{ deviceId: string }>();
  const { data: device, isLoading, error } = useDevice(deviceId);
  const can = usePermissions();

  if (isLoading) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
      </section>
    );
  }

  if (!device) return <NotFoundFallback />;
  if (error || !deviceId) return <ErrorFallback />;

  const hasConfig = Object.keys(device.config).length > 0;

  return (
    <section className="space-y-8">
      {/* ── Header ── */}
      <div className="pb-6 border-b border-border">
        {/* Back link */}
        <Link
          to="/devices"
          className="group mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          {t("devices.title")}
        </Link>

        {/* Title row */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="truncate font-display text-2xl font-semibold text-foreground">
                {device.name || deviceId}
              </h1>
              <DeviceTypeChip type={device.type} />
            </div>

            {/* Meta */}
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-baseline gap-1.5">
                {t("common:common.driver")}
                <Link
                  to={`/drivers/${device.driverId}`}
                  className="font-mono text-xs text-primary transition-colors hover:text-primary/70"
                >
                  {device.driverId}
                </Link>
              </span>
              <span className="text-border">|</span>
              <span className="inline-flex items-baseline gap-1.5">
                {t("common:common.transport")}
                <Link
                  to={`/transports/${device.transportId}`}
                  className="font-mono text-xs text-primary transition-colors hover:text-primary/70"
                >
                  {device.transportId}
                </Link>
              </span>
              {hasConfig && (
                <>
                  <span className="text-border">|</span>
                  <span className="flex items-center gap-1.5">
                    {Object.entries(device.config).map(([key, value], i) => (
                      <span key={key} className="font-mono text-xs">
                        {i > 0 && (
                          <span className="text-muted-foreground"> · </span>
                        )}
                        <span className="text-muted-foreground">{key}=</span>
                        <span className="text-foreground">{String(value)}</span>
                      </span>
                    ))}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 gap-2">
            {can("devices:write") && (
              <Button asChild variant="outline" size="sm">
                <Link to="edit">
                  <Pencil className="h-3.5 w-3.5" />
                  {t("devices.actions.edit")}
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link to="history">
                <History className="h-3.5 w-3.5" />
                {t("deviceDetails.history")}
              </Link>
            </Button>
            {can("devices:write") && (
              <Button asChild size="sm">
                <Link to="commands/new">
                  <Terminal className="h-3.5 w-3.5" />
                  {t("commands.newCommand")}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Active faults ── */}
      <ActiveFaultsSection device={device} />

      {/* ── Content ── */}
      <Outlet />
    </section>
  );
}
