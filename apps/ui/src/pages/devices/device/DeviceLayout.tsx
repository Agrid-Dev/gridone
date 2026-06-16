import { type FC } from "react";
import { Outlet, useParams } from "react-router";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import { ActiveFaultsSection } from "@/components/ActiveFaultsSection";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { DeviceHeader } from "./DeviceHeader";

const DeviceLayoutContent: FC = () => {
  const device = useDeviceFromRoute();

  return (
    <section className="space-y-8">
      <DeviceHeader device={device} />
      <ActiveFaultsSection device={device} />
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
