import { FC, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useDevicesList } from "@/hooks/useDevicesList";
import { getAssetTreeWithDevices, type AssetTreeNode } from "@/api/assets";
import { CommandWizard } from "@/pages/devices/commands/new/CommandWizard";
import { useCommandWizard } from "@/pages/devices/commands/new/useCommandWizard";
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

  // Form-progression hook only — no dispatch / save mutations from inside
  // the action form. The submit action just bubbles the payload up; the
  // automation form's own mutation chain (commit 3) does the writes.
  const wizard = useCommandWizard({ devices, skipReview: true });

  if (devicesLoading || assetTreeLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    // Left margin + border signals nesting inside the action card; the
    // wizard's stepper Next/Back buttons stay inside the bordered area.
    <div className="ml-2 border-l-2 border-muted pl-4">
      <CommandWizard
        wizard={wizard}
        devices={devices}
        assetTree={assetTree}
        assetsList={assetsList}
        submitAction={{
          label: t("automations:actions.useCommand"),
          onAction: (payload) => onChange({ kind: "inlineCommand", payload }),
        }}
        onCancel={() => onChange(null)}
      />
    </div>
  );
};
