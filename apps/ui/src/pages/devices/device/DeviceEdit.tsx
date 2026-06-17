import DeviceForm from "./form";
import { useTranslation } from "react-i18next";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import { useDeleteDevice } from "@/hooks/useDeleteDevice";
import { useBreadcrumb } from "@/components/BreadcrumbProvider";
import { ResourceDeleteButton } from "@/components/ResourceDeleteButton";
import { usePermissions } from "@/contexts/AuthContext";
import { isPhysicalDevice } from "@/api/devices";

export default function DeviceEdit() {
  const { t } = useTranslation("devices");
  const device = useDeviceFromRoute();
  const can = usePermissions();
  const { handleDelete, isDeleting } = useDeleteDevice();

  useBreadcrumb([
    { to: `/devices/${device.id}/edit`, labelKey: "breadcrumb.edit" },
  ]);

  return (
    <div className="space-y-4">
      {can("devices:write") && (
        <div className="flex justify-end">
          <ResourceDeleteButton
            onDelete={() => handleDelete(device.id)}
            isDeleting={isDeleting}
            confirmTitle={t("devices.actions.deleteDialogTitle")}
            confirmDetails={t("devices.actions.deleteDialogContent", {
              name: device.name || device.id,
            })}
            deleteLabel={t("devices.actions.delete")}
          />
        </div>
      )}

      {isPhysicalDevice(device) ? (
        <DeviceForm device={device} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("devices.edit.virtualNotEditable")}
        </p>
      )}
    </div>
  );
}
