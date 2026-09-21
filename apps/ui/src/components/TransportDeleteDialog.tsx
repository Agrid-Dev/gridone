import { useTranslation } from "react-i18next";
import { ResourceDeleteButton } from "./ResourceDeleteButton";

export function TransportDeleteDialog({
  transportName,
  onConfirm,
  isDeleting,
}: {
  transportName: string;
  onConfirm: () => Promise<unknown>;
  isDeleting: boolean;
}) {
  const { t } = useTranslation(["transports", "common"]);
  return (
    <ResourceDeleteButton
      onDelete={onConfirm}
      isDeleting={isDeleting}
      confirmTitle={t("common:deletion.title", { name: transportName })}
      confirmDetails={t("deleteConfirm", { name: transportName })}
    />
  );
}
