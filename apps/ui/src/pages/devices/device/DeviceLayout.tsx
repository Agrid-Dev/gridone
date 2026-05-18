import { Outlet, useParams } from "react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { useDevice } from "@/hooks/useDevice";
import { ActiveFaultsSection } from "@/components/ActiveFaultsSection";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { DeviceHeader } from "./DeviceHeader";

export default function DeviceLayout() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const { data: device, isLoading, error } = useDevice(deviceId);

  if (isLoading) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
      </section>
    );
  }

  if (!device) return <NotFoundFallback />;
  if (error || !deviceId) return <ErrorFallback />;

  return (
    <section className="space-y-8">
      <DeviceHeader device={device} />
      <ActiveFaultsSection device={device} />
      <Outlet />
    </section>
  );
}
