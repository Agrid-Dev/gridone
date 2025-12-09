import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Device, listDevices } from "../api/devices";

export function useDevicesList() {
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

  return {
    devices,
    loading,
    error,
    refreshing,
    fetchDevices,
  };
}

