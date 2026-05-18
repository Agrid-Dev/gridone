import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Building2, Cpu, TriangleAlert, Users } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/contexts/AuthContext";
import { useDevicesList } from "@/hooks/useDevicesList";
import { useFaultsList } from "@/hooks/useFaultsList";
import { useUsers } from "@/hooks/useUsers";
import { useZonesList } from "@/hooks/useZonesList";

type StatTone = "blue" | "green" | "amber" | "violet" | "rose" | "slate";

function renderValue(count: number | null, loading: boolean): ReactNode {
  if (loading) return <Skeleton className="h-7 w-12" />;
  if (count === null) return "—";
  return count;
}

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

  const devicesCount = devicesError ? null : devices.length;
  const zonesCount = zonesError ? null : zones.length;
  const faultsCount = faultsError ? null : faults.length;
  const usersCount = usersQuery.error ? null : usersQuery.users.length;

  const faultsTone: StatTone =
    faultsCount !== null && faultsCount > 0 ? "rose" : "slate";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Link to="/devices" className="block">
        <StatCard
          icon={Cpu}
          tone="blue"
          label={t("home.devices", { count: devicesCount ?? 0 })}
          value={renderValue(devicesCount, devicesLoading)}
        />
      </Link>

      <Link to="/assets" className="block">
        <StatCard
          icon={Building2}
          tone="violet"
          label={t("home.zones", { count: zonesCount ?? 0 })}
          value={renderValue(zonesCount, zonesLoading)}
        />
      </Link>

      <Link to="/faults" className="block">
        <StatCard
          icon={TriangleAlert}
          tone={faultsTone}
          label={t("home.faults", { count: faultsCount ?? 0 })}
          value={renderValue(faultsCount, faultsLoading)}
        />
      </Link>

      {can("users:read") && (
        <Link to="/users" className="block">
          <StatCard
            icon={Users}
            tone="amber"
            label={t("home.users", { count: usersCount ?? 0 })}
            value={renderValue(usersCount, usersQuery.isLoading)}
          />
        </Link>
      )}
    </div>
  );
}
