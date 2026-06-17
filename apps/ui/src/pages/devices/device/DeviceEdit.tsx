import DeviceForm from "./form";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceDeleteMenu } from "@/components/ResourceDeleteMenu";
import { useTranslation } from "react-i18next";
import { useDeviceDetails } from "@/hooks/useDeviceDetails";
import { useDeleteDevice } from "@/hooks/useDeleteDevice";
import { useParams } from "react-router";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { useBreadcrumb } from "@/components/BreadcrumbProvider";
import { usePermissions } from "@/contexts/AuthContext";
import { isPhysicalDevice } from "@/api/devices";

function DeviceEdit() {
  const { t } = useTranslation("devices");
  const { device } = useDeviceDetails();
  const { handleDelete, isDeleting } = useDeleteDevice();
  const can = usePermissions();

  useBreadcrumb([
    { to: `/devices/${device.id}`, label: device.name || device.id },
    { to: `/devices/${device.id}/edit`, labelKey: "breadcrumb.edit" },
  ]);

  return (
    <>
      <ResourceHeader
        resourceName={t("devices.title")}
        title={t("devices.edit.title")}
        actions={
          can("devices:write") ? (
            <ResourceDeleteMenu
              onDelete={() => handleDelete(device.id)}
              isDeleting={isDeleting}
              confirmTitle={t("devices.actions.deleteDialogTitle")}
              confirmDetails={t("devices.actions.deleteDialogContent", {
                name: device.name || device.id,
              })}
              deleteLabel={t("devices.actions.delete")}
            />
          ) : undefined
        }
      />
      {isPhysicalDevice(device) ? (
        <DeviceForm device={device} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("devices.edit.virtualNotEditable")}
        </p>
      )}
    </>
  );
}

export default function DeviceEditWrapper() {
  const { deviceId } = useParams<{ deviceId: string }>();
  return (
    <section className="space-y-6">
      <ResourceBoundary resetKeys={[deviceId]}>
        <DeviceEdit />
      </ResourceBoundary>
    </section>
  );
}
