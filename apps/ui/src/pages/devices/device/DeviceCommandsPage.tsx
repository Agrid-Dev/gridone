import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResourceHeader } from "@/components/ResourceHeader";
import { usePermissions } from "@/contexts/AuthContext";
import { useDevice } from "@/hooks/useDevice";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { Skeleton } from "@/components/ui/skeleton";
import CommandsPage from "@/pages/devices/commands/CommandsPage";

export default function DeviceCommandsPage() {
  const { t } = useTranslation("devices");
  const can = usePermissions();
  const { deviceId } = useParams<{ deviceId: string }>();
  const { data: device, isLoading, error } = useDevice(deviceId);

  if (isLoading) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </section>
    );
  }

  if (!device || !deviceId) return <NotFoundFallback />;
  if (error) return <ErrorFallback />;

  const newCommandButton = can("devices:write") ? (
    <Button asChild size="sm">
      <Link to={`/devices/${deviceId}/commands/new`}>
        <Plus className="h-4 w-4" />
        {t("commands.newCommand")}
      </Link>
    </Button>
  ) : null;

  return (
    <CommandsPage
      deviceId={deviceId}
      header={
        <ResourceHeader
          resourceName={t("devices.title")}
          resourceNameLinksBack
          backTo="/devices"
          title={
            <>
              <Link to={`/devices/${deviceId}`} className="hover:underline">
                {device.name || device.id}
              </Link>
              {" / "}
              {t("commands.title")}
            </>
          }
          actions={newCommandButton}
        />
      }
    />
  );
}
