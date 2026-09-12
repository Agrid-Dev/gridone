import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Cpu, Layers2, Plus, Puzzle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { usePermissions } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useGroupsPage } from "./useGroupsPage";
import { DevicesTabs } from "./DevicesTabs";
import { GroupError } from "./GroupError";

export default function GroupsListPage() {
  const { t } = useTranslation("devices");
  const can = usePermissions();
  const { groups, isLoading, error, search, setSearch, filtered, total } =
    useGroupsPage();
  return (
    <section className="space-y-6">
      <ResourceHeader
        flush
        title={t("devices.title")}
        caption={t("groups.caption")}
        actions={
          can("devices:write") && (
            <Button asChild>
              <Link to="/devices/groups/new">
                <Plus />
                {t("groups.create")}
              </Link>
            </Button>
          )
        }
      />
      <DevicesTabs />
      <GroupError error={error} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {t("groups.title")}
          <Badge variant="secondary" className="tabular-nums">
            {total}
          </Badge>
        </h2>
        <div className="relative w-full sm:w-72">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label={t("groups.searchGroups")}
            placeholder={t("groups.searchGroups")}
            className="bg-card pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      {isLoading ? (
        <div
          role="status"
          aria-label={t("presentation.loading")}
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <ResourceEmpty
          resourceName={t("groups.title").toLowerCase()}
          filtered={filtered}
          onClearFilters={() => setSearch("")}
          showCreate={can("devices:write")}
          className="rounded-xl border bg-card py-16"
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <li key={group.id} className="min-w-0">
              <Link
                to={`/devices/groups/${group.id}`}
                className="group flex h-full flex-col rounded-xl border bg-card shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="flex flex-1 items-start gap-4 p-5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Layers2 aria-hidden className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words font-semibold transition-colors group-hover:text-primary">
                      {group.name}
                    </h3>
                    {group.description && (
                      <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">
                        {group.description}
                      </p>
                    )}
                    <p className="mt-4 flex items-center gap-1.5 text-sm font-medium">
                      <Cpu
                        aria-hidden
                        className="h-4 w-4 text-muted-foreground"
                      />
                      {t("groups.equipmentCount", {
                        count: group.device_ids?.length ?? 0,
                      })}
                    </p>
                  </div>
                  <ArrowUpRight
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                  />
                </div>
                <div className="flex items-center gap-2 rounded-b-xl border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground">
                  <Puzzle aria-hidden className="h-3.5 w-3.5 shrink-0" />
                  <span className="sr-only">{t("groups.driver")}: </span>
                  <span className="truncate font-mono" title={group.driver_id}>
                    {group.driver_id}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
