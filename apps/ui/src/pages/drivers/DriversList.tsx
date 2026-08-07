import { FC } from "react";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { ResourceHeader } from "@/components/ResourceHeader";
import { TypeFilterChips } from "@/components/TypeFilterChips";
import { usePermissions } from "@/contexts/AuthContext";
import { DriversTable } from "./DriversTable";
import { useDriversPage } from "./useDriversPage";

const DriversList: FC = () => {
  const { t } = useTranslation(["drivers", "common"]);
  const [, setSearchParams] = useSearchParams();
  const can = usePermissions();
  const { drivers, typeCounts, total, loading, hasFilters } = useDriversPage();

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("title")}
        caption={t("caption")}
        actions={
          can("drivers:write") ? (
            <Button asChild>
              <Link to="new">
                <Plus />
                {t("actions.create")}
              </Link>
            </Button>
          ) : undefined
        }
      />

      <TypeFilterChips
        options={typeCounts.map(({ type, count }) => ({
          key: type,
          label: t(`common:common.deviceTypes.${type}`, { defaultValue: type }),
          count,
        }))}
        total={total}
        allLabel={t("common:common.allTypes")}
        ariaLabel={t("filters.label")}
      />

      {loading ? (
        <div
          role="status"
          aria-label={t("common:common.loading")}
          className="space-y-2"
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10" />
          ))}
        </div>
      ) : drivers.length > 0 ? (
        <DriversTable drivers={drivers} />
      ) : (
        <ResourceEmpty
          resourceName="driver"
          filtered={hasFilters}
          onClearFilters={() => setSearchParams({})}
        />
      )}
    </section>
  );
};

export default DriversList;
