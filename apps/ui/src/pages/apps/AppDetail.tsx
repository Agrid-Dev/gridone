import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BackLink } from "@/components/BackLink";
import { ResourceHeader } from "@/components/ResourceHeader";
import { usePermissions } from "@/contexts/AuthContext";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { AppIcon } from "./components/AppIcon";
import { AppStatusBadge } from "./components/AppStatusBadge";
import { AppCapabilities } from "./components/AppCapabilities";
import AppConfigForm from "./components/AppConfigForm";

export default function AppDetail() {
  const { t } = useTranslation("apps");
  const { appId } = useParams<{ appId: string }>();
  const queryClient = useQueryClient();
  const client = useGridoneClient();
  const can = usePermissions();

  const { data: app, isLoading } = useQuery({
    queryKey: ["apps", appId],
    queryFn: () => client.apps.get(appId!),
    enabled: !!appId,
  });

  const enableMutation = useMutation({
    mutationFn: () => client.apps.enable(appId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apps"] });
      toast.success(t("enabled"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const disableMutation = useMutation({
    mutationFn: () => client.apps.disable(appId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apps"] });
      toast.success(t("disabled"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !app) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const isBusy = enableMutation.isPending || disableMutation.isPending;
  const isDisabled = app.enabled === false;

  return (
    <section className="space-y-6">
      <BackLink to="/apps">{t("title")}</BackLink>

      <ResourceHeader
        title={
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <AppIcon name={app.icon} />
            </span>
            {app.name}
          </span>
        }
        caption={app.description}
        /* The health loop probes disabled apps too: showing both badges would
         * read as a contradiction, so "Disabled" wins.
         * TODO: display last health check timestamp when backend exposes it */
        status={
          isDisabled ? (
            <Badge variant="secondary">{t("disabledBadge")}</Badge>
          ) : (
            <AppStatusBadge status={app.status ?? "registered"} />
          )
        }
        actions={
          can("users:write") ? (
            isDisabled ? (
              <Button onClick={() => enableMutation.mutate()} disabled={isBusy}>
                {t("enable")}
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => disableMutation.mutate()}
                disabled={isBusy}
              >
                {t("disable")}
              </Button>
            )
          ) : undefined
        }
      />

      {/* Info card */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="grid grid-cols-2 gap-y-4 text-sm">
          <div>
            <span className="text-muted-foreground">{t("fields.apiUrl")}</span>
            <p className="mt-1 text-xs text-foreground">{app.api_url}</p>
          </div>
          <div>
            <span className="text-muted-foreground">
              {t("fields.createdAt")}
            </span>
            <p className="mt-1 text-foreground">
              {app.created_at
                ? new Date(app.created_at).toLocaleDateString()
                : "-"}
            </p>
          </div>
        </div>

        <div className="mt-6 border-t border-border pt-4">
          <AppCapabilities capabilities={app.capabilities} />
        </div>
      </div>

      {/* Configuration */}
      {can("users:write") && (
        <AppConfigForm appId={appId!} pushStatus={app.push_status} />
      )}
    </section>
  );
}
