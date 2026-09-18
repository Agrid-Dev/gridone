import { useParams } from "react-router";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ResourceHeader } from "@/components/ResourceHeader";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import { usePermissions } from "@/contexts/AuthContext";
import { ResourceDeleteButton } from "@/components/ResourceDeleteButton";
import { BackLink } from "@/components/BackLink";
import { TargetPresenter } from "../commands/presenters/TargetPresenter";
import { TagGroupControls } from "./TagGroupControls";
import { GroupError } from "@/components/group-command/GroupError";
import { useViewDetails } from "./useViewDetails";

export default function ViewDetailPage() {
  const { viewId } = useParams();
  return viewId ? (
    <ViewDetails key={viewId} id={viewId} />
  ) : (
    <NotFoundFallback />
  );
}
function ViewDetails({ id }: { id: string }) {
  const { t } = useTranslation(["devices", "common"]);
  const can = usePermissions();
  const detail = useViewDetails(id);
  if (detail.view.isLoading)
    return <p role="status">{t("presentation.loading")}</p>;
  const view = detail.view.data;
  if (!view) return <NotFoundFallback />;
  return (
    <section className="space-y-6">
      <BackLink to="/devices/views">{t("groups.title")}</BackLink>
      <ResourceHeader
        title={view.name}
        caption={view.description}
        actions={
          can("devices:write") && (
            <>
              <Button asChild variant="outline">
                <Link to={`/devices/views/${id}/edit`}>
                  {t(detail.isGroup ? "groups.edit" : "views.edit")}
                </Link>
              </Button>
              <ResourceDeleteButton
                onDelete={detail.deleteView}
                isDeleting={detail.remove.isPending}
                confirmTitle={t("common:deletion.title", {
                  name: view.name || view.id,
                })}
                confirmDetails={t(
                  detail.isGroup
                    ? "groups.deleteDescription"
                    : "views.deleteDescription",
                  { name: view.name || view.id },
                )}
              />
            </>
          )
        }
      />
      {detail.isGroup ? (
        <p className="text-sm text-muted-foreground">
          {t("groups.equipmentCount", { count: detail.devices.length })}
        </p>
      ) : (
        <TargetPresenter target={detail.filter} />
      )}
      {view.group_by.length > 0 && (
        <nav
          className="flex flex-wrap items-center gap-2"
          aria-label={t("views.path")}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => detail.selectPath([])}
          >
            {view.name}
          </Button>
          {detail.path.map((value, i) => (
            <Button
              key={i}
              variant="ghost"
              size="sm"
              onClick={() => detail.selectPath(detail.path.slice(0, i + 1))}
            >
              / {view.group_by[i]}:{value}
            </Button>
          ))}
        </nav>
      )}
      <GroupError error={detail.view.error || detail.members.error} />
      {detail.members.loading ? (
        <p role="status">{t("presentation.loading")}</p>
      ) : (
        <>
          {!!detail.key && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {detail.groups.map((group) => (
                <button
                  key={group.value}
                  aria-label={`${detail.key}:${group.value} (${group.count})`}
                  className="flex justify-between rounded-xl border bg-card p-4 text-left hover:border-primary"
                  onClick={() =>
                    detail.selectPath([...detail.path, group.value])
                  }
                >
                  <span>
                    {detail.key}:{group.value}
                  </span>
                  <span className="text-muted-foreground">{group.count}</span>
                </button>
              ))}
            </div>
          )}
          {!!detail.untagged.length && (
            <details className="rounded-lg border p-4">
              <summary>
                {t("views.untagged", {
                  key: detail.key,
                  count: detail.untagged.length,
                })}
              </summary>
              <ul className="mt-3 space-y-2">
                {detail.untagged.map((d) => (
                  <li key={d.id}>
                    <Link className="text-sm underline" to={`/devices/${d.id}`}>
                      {d.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {!detail.devices.length && (
            <p className="rounded-lg border border-dashed p-6 text-muted-foreground">
              {t(detail.isGroup ? "groups.empty" : "views.empty")}
              {detail.isGroup && can("devices:write") && (
                <Link
                  className="ml-2 underline"
                  to={`/devices/views/${id}/edit`}
                >
                  {t("groups.chooseDevices")}
                </Link>
              )}
            </p>
          )}
          {detail.driverIds.map((driverId) => (
            <div key={driverId} className="rounded-xl border bg-card p-5">
              <TagGroupControls
                key={JSON.stringify(detail.filter)}
                driverId={driverId}
                filter={{ ...detail.filter, driver_id: driverId }}
                devices={detail.devices.filter((d) => d.driver_id === driverId)}
                targetName={view.name}
              />
            </div>
          ))}
        </>
      )}
    </section>
  );
}
