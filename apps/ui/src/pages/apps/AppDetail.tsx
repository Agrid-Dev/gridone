import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceHeader } from "@/components/ResourceHeader";
import { usePermissions } from "@/contexts/AuthContext";
import { getApp, enableApp, disableApp } from "@/api/apps";
import { listUsers } from "@/api/users";
import { AppStatusBadge } from "./components/AppStatusBadge";
import AppConfigForm from "./components/AppConfigForm";

export default function AppDetail() {
  const { t } = useTranslation();
  const { appId } = useParams<{ appId: string }>();
  const queryClient = useQueryClient();
  const can = usePermissions();

  const { data: app, isLoading } = useQuery({
    queryKey: ["apps", appId],
    queryFn: () => getApp(appId!),
    enabled: !!appId,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: listUsers,
    enabled: !!app,
  });

  const appUser = users.find((u) => u.id === app?.userId);
  const isDisabled = appUser?.isBlocked ?? false;

  const enableMutation = useMutation({
    mutationFn: () => enableApp(appId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apps"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("apps.enabled"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const disableMutation = useMutation({
    mutationFn: () => disableApp(appId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apps"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("apps.disabled"));
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

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={app.name}
        resourceName={t("apps.title")}
        resourceNameLinksBack
        backTo="/apps"
        actions={
          can("users:write") ? (
            isDisabled ? (
              <Button
                className="bg-green-600 text-white hover:bg-green-700"
                onClick={() => enableMutation.mutate()}
                disabled={isBusy}
              >
                {t("apps.enable")}
              </Button>
            ) : (
              <Button
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50"
                onClick={() => disableMutation.mutate()}
                disabled={isBusy}
              >
                {t("apps.disable")}
              </Button>
            )
          ) : undefined
        }
      />

      {/* Info card */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="grid grid-cols-2 gap-y-4 text-sm">
          <div>
            <span className="text-muted-foreground">
              {t("apps.fields.description")}
            </span>
            <p className="mt-1 text-foreground">{app.description}</p>
          </div>
          <div>
            <span className="text-muted-foreground">
              {t("apps.fields.status")}
            </span>
            {/* TODO: display last health check timestamp when backend exposes it */}
            <div className="mt-1">
              <AppStatusBadge status={app.status} />
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">
              {t("apps.fields.apiUrl")}
            </span>
            <p className="mt-1 font-mono text-xs text-foreground">
              {app.apiUrl}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">
              {t("apps.fields.createdAt")}
            </span>
            <p className="mt-1 text-foreground">
              {new Date(app.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">
              {t("apps.fields.icon")}
            </span>
            <p className="mt-1 text-2xl">{app.icon}</p>
          </div>
        </div>
      </div>

      {/* Configuration */}
      {can("users:write") && <AppConfigForm appId={appId!} />}
    </section>
  );
}
