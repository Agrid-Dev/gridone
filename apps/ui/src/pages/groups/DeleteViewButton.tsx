import { useTranslation } from "react-i18next";
import type { DeviceView } from "@gridone/sdk";
import { ResourceDeleteButton } from "@/components/ResourceDeleteButton";
import { useViewDeletion } from "./useViewDeletion";

export function DeleteViewButton({ view }: { view: DeviceView }) {
  const { t } = useTranslation(["devices", "common"]);
  const { deleteView, isDeleting, isGroup } = useViewDeletion(view);
  const name = view.name || view.id;
  return (
    <ResourceDeleteButton
      onDelete={deleteView}
      isDeleting={isDeleting}
      confirmTitle={t("common:deletion.title", { name })}
      confirmDetails={t(
        isGroup ? "groups.deleteDescription" : "views.deleteDescription",
        { name },
      )}
    />
  );
}
