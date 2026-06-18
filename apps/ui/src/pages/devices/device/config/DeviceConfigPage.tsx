import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import { useDeleteDevice } from "@/hooks/useDeleteDevice";
import { useBreadcrumb } from "@/components/BreadcrumbProvider";
import { ConfirmButton } from "@/components/ConfirmButton";
import { isPhysicalDevice, type Device } from "@/api/devices";
import { useDeviceConfigEdit, type ConfigSection } from "./useDeviceConfigEdit";
import { IdentitySection } from "./IdentitySection";
import { DriverNetworkSection } from "./DriverNetworkSection";
import { DriverConfigSection } from "./DriverConfigSection";
import { MetadataSection } from "./MetadataSection";

/** The device "Config" tab: per-category sections with inline edit-in-place.
 *  Each editable section persists only its own fields via a partial PATCH; one
 *  section edits at a time. Physical devices show identity, driver & network,
 *  config and metadata; virtual devices show only identity and metadata. */
export default function DeviceConfigPage() {
  const { t } = useTranslation("devices");
  const device = useDeviceFromRoute();
  const { handleDelete, isDeleting } = useDeleteDevice();
  const {
    canWrite,
    editingSection,
    setEditingSection,
    submittingSection,
    update,
  } = useDeviceConfigEdit(device);

  useBreadcrumb([
    { to: `/devices/${device.id}/config`, labelKey: "breadcrumb.config" },
  ]);

  const cardProps = (section: ConfigSection) => ({
    isEditing: editingSection === section,
    canEdit: canWrite && editingSection === null,
    isSubmitting: submittingSection === section,
    onEdit: () => setEditingSection(section),
    onCancel: () => setEditingSection(null),
    onSave: (payload: Partial<Device>) => update(section, payload),
  });

  return (
    <div className="max-w-2xl space-y-10">
      <IdentitySection device={device} {...cardProps("identity")} />
      {isPhysicalDevice(device) && (
        <>
          <DriverNetworkSection
            device={device}
            {...cardProps("driverTransport")}
          />
          <DriverConfigSection device={device} {...cardProps("config")} />
        </>
      )}
      <MetadataSection device={device} />

      {canWrite && (
        <div className="flex justify-end border-t border-border/50 pt-4">
          <ConfirmButton
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            disabled={isDeleting}
            onConfirm={() => handleDelete(device.id)}
            confirmTitle={t("devices.actions.deleteDialogTitle")}
            confirmDetails={t("devices.actions.deleteDialogContent", {
              name: device.name || device.id,
            })}
            confirmLabel={t("devices.actions.deleteDevice")}
          >
            <Trash2 className="h-4 w-4" />
            {t("devices.actions.deleteDevice")}
          </ConfirmButton>
        </div>
      )}
    </div>
  );
}
