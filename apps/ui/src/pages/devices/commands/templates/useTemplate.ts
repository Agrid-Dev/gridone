import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/api/apiError";
import {
  deleteTemplate,
  dispatchTemplate,
  getTemplate,
  type CommandTemplate,
} from "@/api/commands";
import { listDevices, type Device } from "@/api/devices";
import { useAssetTree } from "@/hooks/useAssetTree";

/** Encapsulates everything the template detail page needs: the template
 *  itself (fetched under Suspense — an unknown id propagates as `ApiError(404)`
 *  to the nearest `ResourceBoundary`, so `template` is always defined), the
 *  live-resolved device list, the asset-name lookup used by the
 *  TargetPresenter, and the execute/delete mutations with their toast +
 *  navigation side effects. */
export function useTemplate(templateId: string) {
  const { t } = useTranslation("devices");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: template } = useSuspenseQuery<CommandTemplate>({
    queryKey: ["command-templates", templateId],
    queryFn: () => getTemplate(templateId),
  });

  const { assetsById } = useAssetTree();

  // Resolve devices live so the page reflects the current asset membership.
  const target = template.target;
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
    template,
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
