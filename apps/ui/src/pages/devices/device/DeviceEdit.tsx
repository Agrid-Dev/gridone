import DeviceForm from "./form";
import { ResourceHeader } from "@/components/ResourceHeader";
import { useTranslation } from "react-i18next";
import { useDeviceDetails } from "@/hooks/useDeviceDetails";
import { Skeleton } from "@/components/ui/skeleton";
import { useParams } from "react-router";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { ErrorBoundary } from "react-error-boundary";

const Loader = () => (
  <div className="space-y-4">
    <Skeleton className="h-10 w-1/2" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
  </div>
);

function DeviceEdit() {
  const { deviceId } = useParams();
  const { device, loading } = useDeviceDetails(deviceId);
  if (loading) {
    return <Loader />;
  }
  if (!device) {
    return <NotFoundFallback />;
  }
  return <DeviceForm device={device} />;
}

export default function DeviceEditWrapper() {
  const { t } = useTranslation();
  return (
    <section className="space-y-6">
      <ResourceHeader
        resourceName={t("devices.title")}
        title={t("devices.edit.title")}
        resourceNameLinksBack
      />
      <ErrorBoundary fallback={<ErrorFallback />}>
        <DeviceEdit />
      </ErrorBoundary>
    </section>
  );
}
