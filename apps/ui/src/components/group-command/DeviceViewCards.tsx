import type { ReactNode } from "react";
import type { DeviceView } from "@gridone/sdk";
import { useTranslation } from "react-i18next";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { useDeviceViews } from "@/hooks/useDeviceViews";
import { useDevicesList } from "@/hooks/useDevicesList";
import { GroupError } from "./GroupError";
import { groupMembers, groupTagValue } from "./groupMembership";

/** Every saved group and view as a card, a group with its member count.
 *  `empty` stands in for the grid when there is none. */
export function DeviceViewCards({
  hrefOf,
  empty,
}: {
  hrefOf: (view: DeviceView) => string;
  empty: ReactNode;
}) {
  const { t } = useTranslation("devices");
  const views = useDeviceViews();
  const members = useDevicesList();
  return (
    <>
      <GroupError error={views.error || members.error} />
      {views.isLoading ? (
        <p role="status">{t("presentation.loading")}</p>
      ) : !views.data?.length ? (
        empty
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {views.data.map((view) => {
            const value = groupTagValue(view);
            return (
              <Link
                className="space-y-3 rounded-xl border bg-card p-5 transition-colors hover:border-primary"
                key={view.id}
                to={hrefOf(view)}
              >
                <h2 className="font-semibold">{view.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {view.description}
                </p>
                <p className="text-sm text-muted-foreground">
                  {value !== null
                    ? members.loading || members.error
                      ? "…"
                      : t("groups.equipmentCount", {
                          count: groupMembers(members.devices, value).length,
                        })
                    : view.group_by.join(" → ") || t("views.title")}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
