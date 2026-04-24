import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { DeviceCard } from "./DeviceCard";
import { Button } from "@/components/ui";
import { useDevicesList } from "@/hooks/useDevicesList";
import { useFilterParams } from "@/hooks/useFilterParams";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/contexts/AuthContext";
import { TypeFilter } from "@/components/FilterBar";
import { HealthFilter } from "@/components/HealthFilter";
import { History, Plus, Terminal } from "lucide-react";

export default function DevicesList() {
  const { t } = useTranslation("devices");
  const filters = useFilterParams();
  const [, setSearchParams] = useSearchParams();
  const { devices, loading, error } = useDevicesList(filters);
  const can = usePermissions();
  const hasFilters = !!filters;

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("devices.subtitle")}
        resourceName={t("devices.title")}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/devices/commands">
                <History />
                {t("commands.title")}
              </Link>
            </Button>
            {can("devices:write") && (
              <Button asChild variant="outline" size="sm">
                <Link to="/devices/new">
                  <Plus />
                  {t("devices.actions.add")}
                </Link>
              </Button>
            )}
            {can("devices:write") && (
              <Button asChild size="sm">
                <Link to="/devices/commands/new">
                  <Terminal />
                  {t("commands.newCommand")}
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <TypeFilter />
        <HealthFilter />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-48" />
          ))}
        </div>
      ) : devices.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {devices.map((device, i) => (
            <div
              key={device.id}
              className="animate-fade-up"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <DeviceCard device={device} />
            </div>
          ))}
        </div>
      ) : (
        <ResourceEmpty
          resourceName={t("common:common.device").toLowerCase()}
          filtered={hasFilters}
          onClearFilters={() => setSearchParams({})}
        />
      )}
    </section>
  );
}
