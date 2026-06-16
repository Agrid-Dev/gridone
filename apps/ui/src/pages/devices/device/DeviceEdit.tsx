import DeviceForm from "./form";
import { ResourceHeader } from "@/components/ResourceHeader";
import { DangerZone } from "@/components/DangerZone";
import { useTranslation } from "react-i18next";
import { useDeviceDetails } from "@/hooks/useDeviceDetails";
import { useDeleteDevice } from "@/hooks/useDeleteDevice";
import { useParams } from "react-router";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { usePermissions } from "@/contexts/AuthContext";
import { isPhysicalDevice } from "@/api/devices";

function DeviceEdit() {
  const { t } = useTranslation("devices");
  const { device } = useDeviceDetails();
  const { handleDelete, isDeleting } = useDeleteDevice();
  const can = usePermissions();

  return (
    <>
      {isPhysicalDevice(device) ? (
        <DeviceForm device={device} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("devices.edit.virtualNotEditable")}
        </p>
      )}
      {can("devices:write") && (
        <DangerZone
          onDelete={() => handleDelete(device.id)}
          isDeleting={isDeleting}
          confirmTitle={t("devices.actions.deleteDialogTitle")}
          confirmDetails={t("devices.actions.deleteDialogContent", {
            name: device.name || device.id,
          })}
          deleteLabel={t("devices.actions.delete")}
        />
      )}
    </>
  );
}

export default function DeviceEditWrapper() {
  const { t } = useTranslation("devices");
  const { deviceId } = useParams<{ deviceId: string }>();
  return (
    <section className="space-y-6">
      <ResourceHeader
        resourceName={t("devices.title")}
        title={t("devices.edit.title")}
        resourceNameLinksBack
        backTo="/devices"
      />
      <ResourceBoundary resetKeys={[deviceId]}>
        <DeviceEdit />
      </ResourceBoundary>
    </section>
  );
}
