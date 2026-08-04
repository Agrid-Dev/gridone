import DeviceForm from "./form";
import { useDeviceFromRoute } from "@/hooks/useDevice";

export default function DeviceEdit() {
  const device = useDeviceFromRoute();

  return <DeviceForm device={device} />;
}
