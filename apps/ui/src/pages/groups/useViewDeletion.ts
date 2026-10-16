import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { DeviceView } from "@gridone/sdk";
import { useDeleteDeviceView } from "@/hooks/useDeviceViews";
import { markResourceDeleted } from "@/lib/navigation";
import { groupTagValue } from "@/components/group-command/groupMembership";

/** Deletes a group (its members lose the group tag first) or a view, then
 *  returns to the configuration list. The group keeps its supervision address
 *  as identity, so links to it there read as deleted. */
export function useViewDeletion(view: DeviceView) {
  const groupValue = groupTagValue(view);
  const remove = useDeleteDeviceView(groupValue);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const deleteView = async () => {
    await remove.mutateAsync(view.id);
    markResourceDeleted(`/devices/views/${view.id}`);
    toast.success(t("deletion.success"));
    navigate("/groups", { replace: true });
  };
  return {
    deleteView,
    isDeleting: remove.isPending,
    isGroup: groupValue !== null,
  };
}
