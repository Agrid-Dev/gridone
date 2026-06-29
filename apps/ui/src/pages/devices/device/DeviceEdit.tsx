import DeviceForm from "./form";
import { useTranslation } from "react-i18next";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import { useBreadcrumb } from "@/components/BreadcrumbProvider";
import { isPhysicalDevice } from "@/api/devices";

export default function DeviceEdit() {
  const { t } = useTranslation("devices");
  const device = useDeviceFromRoute();

  useBreadcrumb([
    { to: `/devices/${device.id}/config`, labelKey: "breadcrumb.config" },
    { to: `/devices/${device.id}/config/edit`, labelKey: "breadcrumb.edit" },
  ]);

  if (!isPhysicalDevice(device)) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("devices.edit.virtualNotEditable")}
      </p>
    );
  }

  return <DeviceForm device={device} />;
}
