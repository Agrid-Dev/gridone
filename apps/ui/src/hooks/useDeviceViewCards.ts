import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  groupMembers,
  groupTagValue,
} from "@/components/group-command/groupMembership";
import { useDeviceViews } from "./useDeviceViews";
import { useDevicesList } from "./useDevicesList";

/** Prepare cards once, keeping query failures distinct from an empty collection. */
export function useDeviceViewCards() {
  const { t } = useTranslation("devices");
  const views = useDeviceViews();
  const members = useDevicesList();
  const cards = useMemo(
    () =>
      (views.data ?? []).map((view) => {
        const value = groupTagValue(view);
        return {
          view,
          description:
            value === null
              ? view.group_by.join(" → ") || t("views.title")
              : members.loading
                ? "…"
                : t("groups.equipmentCount", {
                    count: groupMembers(members.devices, value).length,
                  }),
        };
      }),
    [views.data, members.devices, members.loading, t],
  );
  if (views.error) throw views.error;
  if (members.queryError) throw members.queryError;
  return { cards, loading: views.isLoading };
}
