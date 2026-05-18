import { useTranslation } from "react-i18next";
import { Building2, Cpu, TriangleAlert, Users } from "lucide-react";
import { usePermissions } from "@/contexts/AuthContext";
import { useDevicesList } from "@/hooks/useDevicesList";
import { useFaultsList } from "@/hooks/useFaultsList";
import { useUsers } from "@/hooks/useUsers";
import { useZonesList } from "@/hooks/useZonesList";
import { StatCard } from "./StatCard";

export default function HomePage() {
  const { t } = useTranslation("home");
  const can = usePermissions();

  const {
    devices,
    loading: devicesLoading,
    error: devicesError,
  } = useDevicesList();
  const { zones, loading: zonesLoading, error: zonesError } = useZonesList();
  const {
    faults,
    loading: faultsLoading,
    error: faultsError,
  } = useFaultsList();
  const usersQuery = useUsers();

  const faultCount = faultsError ? null : faults.length;

  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          to="/devices"
          icon={Cpu}
          label={t("home.devices")}
          value={devicesError ? null : devices.length}
          loading={devicesLoading}
        />
        <StatCard
          to="/assets"
          icon={Building2}
          label={t("home.zones")}
          value={zonesError ? null : zones.length}
          loading={zonesLoading}
        />
        <StatCard
          to="/faults"
          icon={TriangleAlert}
          label={t("home.faults")}
          value={faultCount}
          loading={faultsLoading}
          tone={faultCount !== null && faultCount > 0 ? "alert" : "default"}
        />
        {can("users:read") && (
          <StatCard
            to="/users"
            icon={Users}
            label={t("home.users")}
            value={usersQuery.error ? null : usersQuery.users.length}
            loading={usersQuery.isLoading}
          />
        )}
      </div>
    </div>
  );
}
