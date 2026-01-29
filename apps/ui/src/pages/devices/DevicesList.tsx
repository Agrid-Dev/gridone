import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { DeviceCard } from "@/components/DeviceCard";
import { Button } from "@/components/ui";
import { useDevicesList } from "@/hooks/useDevicesList";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { ResourceHeader } from "@/components/ResourceHeader";

export default function DevicesList() {
  const { t } = useTranslation();
  const { devices, loading, error, refreshing, fetchDevices } =
    useDevicesList();

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("devices.subtitle")}
        resourceName={t("devices.title")}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => fetchDevices()}
              disabled={loading || refreshing}
            >
              {refreshing ? t("common.refreshing") : t("common.refresh")}
            </Button>
            <Button asChild>
              <Link to="/devices/new">{t("devices.create.title")}</Link>
            </Button>
          </>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-48 animate-pulse rounded-lg border border-slate-200 bg-white"
            />
          ))}
        </div>
      ) : devices.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {devices.map((device) => (
            <DeviceCard key={device.id} device={device} />
          ))}
        </div>
      ) : (
        <ResourceEmpty resourceName={t("common.device").toLowerCase()} />
      )}
    </section>
  );
}
