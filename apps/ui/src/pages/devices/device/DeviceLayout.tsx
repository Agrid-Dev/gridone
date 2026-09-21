import { type FC } from "react";
import { Outlet, useLocation, useParams } from "react-router";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import { ActiveFaultsSection } from "@/components/ActiveFaultsSection";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { DeviceHeader } from "./DeviceHeader";
import { DeviceTabs } from "./DeviceTabs";

const DeviceLayoutContent: FC = () => {
  const device = useDeviceFromRoute();
  const { pathname } = useLocation();
  // Config is a settings destination, not a supervision surface: live faults
  // belong to the sections that show the device at work.
  const inConfig = pathname.startsWith(
    `/devices/${encodeURIComponent(device.id)}/config`,
  );
  return (
    <section className="space-y-6">
      {/* Header + tabs form one frame block: the tab bar owns the single
          divider, so the device name sits flush above it. */}
      <div className="space-y-4">
        <DeviceHeader device={device} />
        <DeviceTabs device={device} />
      </div>
      {!inConfig && <ActiveFaultsSection device={device} />}
      <Outlet />
    </section>
  );
};

export default function DeviceLayout() {
  const { deviceId } = useParams<{ deviceId: string }>();
  return (
    <ResourceBoundary resetKeys={[deviceId]}>
      <DeviceLayoutContent />
    </ResourceBoundary>
  );
}
