import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/BackLink";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { ResourceHeader } from "@/components/ResourceHeader";
import { usePermissions } from "@/contexts/AuthContext";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { AppIcon } from "./components/AppIcon";
import { AppStatusBadge } from "./components/AppStatusBadge";
import { AppCapabilities } from "./components/AppCapabilities";
import AppConfigForm from "./components/AppConfigForm";

/** An unknown app shows the not-found page, and a failed load the error page
 *  (`ResourceBoundary`), rather than a skeleton that never resolves. */
export default function AppDetail() {
  const { appId } = useParams<{ appId: string }>();
  return (
    <ResourceBoundary resetKeys={[appId]}>
      <AppDetailContent appId={appId!} />
    </ResourceBoundary>
  );
}

function AppDetailContent({ appId }: { appId: string }) {
  const { t } = useTranslation("apps");
  const queryClient = useQueryClient();
  const client = useGridoneClient();
  const can = usePermissions();

  // Polled like the list: the status and the app's own message move with each
  // health probe (e.g. the progress of a rollout the app reports). A failed
  // poll keeps the last app shown; only a first load that fails is thrown.
  const { data: app } = useSuspenseQuery({
    queryKey: ["apps", appId],
    queryFn: () => client.apps.get(appId),
    refetchInterval: 3_000,
  });

  const enableMutation = useMutation({
    mutationFn: () => client.apps.enable(appId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apps"] });
      toast.success(t("enabled"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const disableMutation = useMutation({
    mutationFn: () => client.apps.disable(appId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apps"] });
      toast.success(t("disabled"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isBusy = enableMutation.isPending || disableMutation.isPending;
  const isDisabled = app.enabled === false;
  // Goes with the health badge, so "Disabled" hides it too.
  const statusMessage = isDisabled ? null : app.status_message;

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
        caption={
          statusMessage ? (
            <>
              {app.description}
              <p className="mt-2 text-foreground">
                <span className="sr-only">{t("statusMessage")} </span>
                {statusMessage}
              </p>
            </>
          ) : (
            app.description
          )
        }
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
        <AppConfigForm appId={appId} pushStatus={app.push_status} />
      )}
    </section>
  );
}
