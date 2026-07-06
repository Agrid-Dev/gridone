import DeviceForm from "./form";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import { useBreadcrumb } from "@/components/BreadcrumbProvider";

export default function DeviceEdit() {
  const device = useDeviceFromRoute();

  useBreadcrumb([
    { to: `/devices/${device.id}/config`, labelKey: "breadcrumb.config" },
    { to: `/devices/${device.id}/config/edit`, labelKey: "breadcrumb.edit" },
  ]);

  return <DeviceForm device={device} />;
}
