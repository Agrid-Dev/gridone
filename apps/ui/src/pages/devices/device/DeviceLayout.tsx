import { Link, Outlet, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  CardHeader,
  CardContent,
  CardTitle,
} from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { useDevice } from "@/hooks/useDevice";
import { ResourceHeader } from "@/components/ResourceHeader";
import { History } from "lucide-react";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { usePermissions } from "@/contexts/AuthContext";

export default function DeviceLayout() {
  const { t } = useTranslation();
  const { deviceId } = useParams<{ deviceId: string }>();
  const { data: device, isLoading, error } = useDevice(deviceId);
  const can = usePermissions();

  if (isLoading) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </section>
    );
  }

  if (!device) return <NotFoundFallback />;
  if (error || !deviceId) return <ErrorFallback />;

  return (
    <section className="space-y-6">
      <ResourceHeader
        resourceName={t("devices.title")}
        title={device.name || device.id || ""}
        actions={
          <>
            {can("devices:write") && (
              <Button asChild variant="outline">
                <Link to="edit">{t("devices.actions.edit")}</Link>
              </Button>
            )}

            <Button asChild variant="outline">
              <Link to="commands">
                <History className="mr-2 h-4 w-4" />
                {t("commands.title")}
              </Link>
            </Button>

            <Button asChild variant="outline">
              <Link to="history">{t("deviceDetails.history")}</Link>
            </Button>
          </>
        }
        resourceNameLinksBack
        backTo="/devices"
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle className="mt-1">{device.name || deviceId}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("common.driver")}:&nbsp;
                <Link
                  to={`/drivers/${device.driverId}`}
                  className="underline text-primary"
                >
                  {device.driverId}
                </Link>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("common.transport")}:&nbsp;
                <Link
                  to={`/transports/${device.transportId}`}
                  className="underline text-primary"
                >
                  {device.transportId}
                </Link>
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(device.config).map(([key, value]) => (
              <div
                key={key}
                className="flex justify-between border-b border-border pb-2 text-sm"
              >
                <span className="font-medium text-foreground">{key}</span>
                <span className="text-muted-foreground">{String(value)}</span>
              </div>
            ))}
            {Object.keys(device.config).length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t("common.noConfigurationData")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Outlet />
    </section>
  );
}
