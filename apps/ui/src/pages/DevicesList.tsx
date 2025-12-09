import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Device, listDevices } from "../api/devices";
import { DeviceCard } from "../components/DeviceCard";
import { Button } from "../components/ui";

export default function DevicesList() {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDevices = async () => {
    try {
      setError(null);
      if (!loading) {
        setRefreshing(true);
      }
      const list = await listDevices();
      setDevices(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("devices.unableToLoad"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.4em] text-slate-500">
            {t("devices.title")}
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">
            {t("devices.subtitle")}
          </h2>
        </div>
        <Button
          variant="outline"
          onClick={fetchDevices}
          disabled={loading || refreshing}
        >
          {refreshing ? t("common.refreshing") : t("common.refresh")}
        </Button>
      </div>

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
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {devices.map((device) => (
            <DeviceCard key={device.id} device={device} />
          ))}
        </div>
      )}
    </section>
  );
}
