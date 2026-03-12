import DeviceForm from "./form";
import { ResourceHeader } from "@/components/ResourceHeader";
import { DangerZone } from "@/components/DangerZone";
import { useTranslation } from "react-i18next";
import { useDeviceDetails } from "@/hooks/useDeviceDetails";
import { useDeleteDevice } from "@/hooks/useDeleteDevice";
import { Skeleton } from "@/components/ui/skeleton";
import { useParams } from "react-router";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { ErrorBoundary } from "react-error-boundary";
import { usePermissions } from "@/contexts/AuthContext";

const Loader = () => (
  <div className="space-y-4">
    <Skeleton className="h-10 w-1/2" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
  </div>
);

function DeviceEdit() {
  const { t } = useTranslation();
  const { deviceId } = useParams();
  const { device, loading } = useDeviceDetails(deviceId);
  const { handleDelete, isDeleting } = useDeleteDevice();
  const can = usePermissions();

  if (loading) {
    return <Loader />;
  }
  if (!device || !deviceId) {
    return <NotFoundFallback />;
  }
  return (
    <>
      <DeviceForm device={device} />
      {can("devices:write") && (
        <DangerZone
          onDelete={() => handleDelete(deviceId)}
          isDeleting={isDeleting}
          confirmTitle={t("devices.actions.deleteDialogTitle")}
          confirmDetails={t("devices.actions.deleteDialogContent", {
            name: device.name || deviceId,
          })}
          deleteLabel={t("devices.actions.delete")}
        />
      )}
    </>
  );
}

export default function DeviceEditWrapper() {
  const { t } = useTranslation();
  return (
    <section className="space-y-6">
      <ResourceHeader
        resourceName={t("devices.title")}
        title={t("devices.edit.title")}
        resourceNameLinksBack
        backTo="/devices"
      />
      <ErrorBoundary fallback={<ErrorFallback />}>
        <DeviceEdit />
      </ErrorBoundary>
    </section>
  );
}
