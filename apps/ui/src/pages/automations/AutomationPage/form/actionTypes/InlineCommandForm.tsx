import { FC, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useDevicesList } from "@/hooks/useDevicesList";
import { getAssetTreeWithDevices, type AssetTreeNode } from "@/api/assets";
import { CommandWizard } from "@/pages/devices/commands/new/CommandWizard";
import { flattenAssetTree } from "@/pages/devices/commands/new/types";
import type { CustomActionFormProps } from "../../presenters/types";

export const InlineCommandForm: FC<CustomActionFormProps> = ({ onChange }) => {
  const { t } = useTranslation(["automations", "common"]);
  const { devices, loading: devicesLoading } = useDevicesList();
  const { data: assetTree = [], isLoading: assetTreeLoading } = useQuery<
    AssetTreeNode[]
  >({
    queryKey: ["assets", "tree-with-devices"],
    queryFn: getAssetTreeWithDevices,
  });

  const assetsList = useMemo(() => flattenAssetTree(assetTree), [assetTree]);

  if (devicesLoading || assetTreeLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    // Left margin + border signals nesting inside the action card; the
    // wizard's own stepper Next/Back buttons stay visible inside.
    <div className="ml-2 border-l-2 border-muted pl-4">
      <CommandWizard
        devices={devices}
        assetTree={assetTree}
        assetsList={assetsList}
        skipReview
        overrideAction={{
          label: t("automations:actions.useCommand"),
          onAction: (payload) => onChange({ kind: "inlineCommand", payload }),
        }}
        onCancel={() => onChange(null)}
      />
    </div>
  );
};
