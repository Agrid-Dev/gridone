import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import { ApiError } from "@/api/apiError";
import {
  deleteTemplate,
  dispatchTemplate,
  getTemplate,
  type CommandTemplate,
} from "@/api/commands";
import {
  getAssetTreeWithDevices,
  type AssetTreeNode,
  type Asset,
} from "@/api/assets";
import { listDevices, type Device } from "@/api/devices";
import { usePermissions } from "@/contexts/AuthContext";
import CommandsPage from "../CommandsPage";
import { TargetPresenter } from "../presenters/TargetPresenter";
import { WritePresenter } from "../presenters/WritePresenter";

export default function TemplateDetailPage() {
  const { t } = useTranslation("devices");
  const can = usePermissions();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { templateId = "" } = useParams<{ templateId: string }>();

  const query = useQuery<CommandTemplate>({
    queryKey: ["command-templates", templateId],
    queryFn: () => getTemplate(templateId),
    enabled: !!templateId,
  });

  const { data: assetTree = [] } = useQuery<AssetTreeNode[]>({
    queryKey: ["assets", "tree-with-devices"],
    queryFn: getAssetTreeWithDevices,
  });

  const assetsById = useMemo(() => flattenAssets(assetTree), [assetTree]);

  // Resolve devices live from the server so the page reflects the current
  // asset membership. If the target is empty (shouldn't happen for a saved
  // template but be defensive), skip the call.
  const target = query.data?.target;
  const hasTargetFields = !!target && targetHasFields(target);
  const resolvedDevicesQuery = useQuery<Device[]>({
    queryKey: ["template-resolved-devices", templateId, target],
    queryFn: () => listDevices(target),
    enabled: !!target && hasTargetFields,
  });

  const executeMutation = useMutation({
    mutationFn: () => dispatchTemplate(templateId),
    onSuccess: (result) => {
      toast.success(t("commands.templates.executed"));
      queryClient.invalidateQueries({ queryKey: ["commands"] });
      navigate(`/devices/commands?batch_id=${result.batchId}`);
    },
    onError: (err) => {
      const detail =
        err instanceof ApiError ? err.detail || err.message : err.message;
      toast.error(String(detail));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTemplate(templateId),
    onSuccess: () => {
      toast.success(t("commands.templates.deleted"));
      queryClient.invalidateQueries({ queryKey: ["command-templates"] });
      navigate("/devices/commands/templates");
    },
    onError: (err) => {
      const detail =
        err instanceof ApiError ? err.detail || err.message : err.message;
      toast.error(String(detail));
    },
  });

  if (query.isLoading) {
    return (
      <section className="space-y-6">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </section>
    );
  }
  if (query.isError) {
    const err = query.error;
    if (err instanceof ApiError && err.status === 404) {
      return <NotFoundFallback title={t("commands.templates.notFound")} />;
    }
    return <ErrorFallback title={t("common:errors.default")} />;
  }

  const template = query.data!;
  const resolvedDevices = resolvedDevicesQuery.data ?? [];

  const header = (
    <ResourceHeader
      resourceName={t("commands.templates.title")}
      title={template.name ?? t("commands.templates.untitled")}
      resourceNameLinksBack
      backTo="/devices/commands/templates"
      actions={
        can("devices:write") && (
          <>
            <Button
              size="sm"
              onClick={() => executeMutation.mutate()}
              disabled={
                executeMutation.isPending || resolvedDevices.length === 0
              }
            >
              <Play />
              {executeMutation.isPending
                ? t("commands.templates.executing")
                : t("commands.templates.execute")}
            </Button>
            <ConfirmButton
              size="sm"
              variant="outline"
              confirmTitle={t("commands.templates.deleteTitle")}
              confirmDetails={t("commands.templates.deleteHint")}
              confirmLabel={t("common:common.delete")}
              onConfirm={() => deleteMutation.mutate()}
            >
              <Trash2 />
              {t("common:common.delete")}
            </ConfirmButton>
          </>
        )
      }
    />
  );

  return (
    <section className="space-y-6">
      {header}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("commands.templates.targetCard")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <TargetPresenter target={template.target} assetsById={assetsById} />
            <ResolvedDevices
              devices={resolvedDevices}
              isLoading={resolvedDevicesQuery.isLoading}
              hasTarget={hasTargetFields}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("commands.templates.payloadCard")}</CardTitle>
          </CardHeader>
          <CardContent>
            <WritePresenter write={template.write} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("commands.templates.executions")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CommandsPage
            templateId={templateId}
            header={<div className="sr-only">{template.name}</div>}
          />
        </CardContent>
      </Card>
    </section>
  );
}

function ResolvedDevices({
  devices,
  isLoading,
  hasTarget,
}: {
  devices: Device[];
  isLoading: boolean;
  hasTarget: boolean;
}) {
  const { t } = useTranslation("devices");
  if (!hasTarget) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("commands.templates.noTargetFields")}
      </p>
    );
  }
  if (isLoading) {
    return <Skeleton className="h-12 w-full rounded-md" />;
  }
  if (devices.length === 0) {
    return (
      <p className="rounded-md border border-dashed py-4 text-center text-sm text-muted-foreground">
        {t("commands.templates.noResolvedDevices")}
      </p>
    );
  }
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
        {t("commands.templates.resolvedDevices", { count: devices.length })}
      </p>
      <ul className="max-h-48 overflow-y-auto space-y-1 text-sm">
        {devices.map((d) => (
          <li key={d.id}>
            <Link
              to={`/devices/${encodeURIComponent(d.id)}`}
              className="hover:underline"
            >
              {d.name || d.id}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function targetHasFields(target: CommandTemplate["target"]): boolean {
  return !!(
    (target.ids && target.ids.length > 0) ||
    (target.types && target.types.length > 0) ||
    target.assetId ||
    (target.tags && Object.keys(target.tags).length > 0)
  );
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
