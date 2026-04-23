import { useMemo } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/api/apiError";
import {
  deleteTemplate,
  dispatchTemplate,
  getTemplate,
  type CommandTemplate,
} from "@/api/commands";
import {
  getAssetTreeWithDevices,
  type Asset,
  type AssetTreeNode,
} from "@/api/assets";
import { listDevices, type Device } from "@/api/devices";

/** Encapsulates everything the template detail page needs: the template
 *  itself, the live-resolved device list, the asset-name lookup used by the
 *  TargetPresenter, and the execute/delete mutations with their toast +
 *  navigation side effects. */
export function useTemplate(templateId: string) {
  const { t } = useTranslation("devices");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const template = useQuery<CommandTemplate>({
    queryKey: ["command-templates", templateId],
    queryFn: () => getTemplate(templateId),
    enabled: !!templateId,
  });

  const assetTree = useQuery<AssetTreeNode[]>({
    queryKey: ["assets", "tree-with-devices"],
    queryFn: getAssetTreeWithDevices,
  });

  const assetsById = useMemo(
    () => flattenAssets(assetTree.data ?? []),
    [assetTree.data],
  );

  // Resolve devices live so the page reflects the current asset membership.
  const target = template.data?.target;
  const resolvedDevices = useQuery<Device[]>({
    queryKey: ["template-resolved-devices", templateId, target],
    queryFn: () => listDevices(target),
    enabled: !!target,
  });

  const execute = useMutation({
    mutationFn: () => dispatchTemplate(templateId),
    onSuccess: (result) => {
      toast.success(t("commands.templates.executed"));
      queryClient.invalidateQueries({ queryKey: ["commands"] });
      navigate(`/devices/commands?batch_id=${result.batchId}`);
    },
    onError: (err) => toast.error(describeError(err)),
  });

  const remove = useMutation({
    mutationFn: () => deleteTemplate(templateId),
    onSuccess: () => {
      toast.success(t("commands.templates.deleted"));
      queryClient.invalidateQueries({ queryKey: ["command-templates"] });
      navigate("/devices/commands/templates");
    },
    onError: (err) => toast.error(describeError(err)),
  });

  return {
    template: template.data,
    isLoading: template.isLoading,
    error: template.error,
    assetsById,
    resolvedDevices: resolvedDevices.data ?? [],
    isResolving: resolvedDevices.isLoading,
    execute: () => execute.mutate(),
    isExecuting: execute.isPending,
    remove: () => remove.mutate(),
    isRemoving: remove.isPending,
  };
}

function describeError(err: Error): string {
  if (err instanceof ApiError) return err.detail || err.message;
  return err.message;
}

function flattenAssets(tree: AssetTreeNode[]): Record<string, Asset> {
  const out: Record<string, Asset> = {};
  const walk = (nodes: AssetTreeNode[]) => {
    for (const n of nodes) {
      out[n.id] = {
        id: n.id,
        parentId: n.parentId,
        type: n.type,
        name: n.name,
        path: n.path,
        position: n.position,
      };
      walk(n.children);
    }
  };
  walk(tree);
  return out;
}
