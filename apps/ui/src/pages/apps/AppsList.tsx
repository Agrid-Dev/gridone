import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { usePermissions } from "@/contexts/AuthContext";
import { usePendingAppRequests } from "@/hooks/usePendingAppRequests";
import type { App } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { AppStatusBadge } from "./components/AppStatusBadge";

export default function AppsList() {
  const { t } = useTranslation("apps");
  const queryClient = useQueryClient();
  const client = useGridoneClient();
  const can = usePermissions();
  const { pendingCount } = usePendingAppRequests();

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["apps"],
    queryFn: () => client.apps.list(),
    refetchInterval: 3_000,
  });

  const enableMutation = useMutation({
    mutationFn: (appId: string) => client.apps.enable(appId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apps"] });
      toast.success(t("enabled"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const disableMutation = useMutation({
    mutationFn: (appId: string) => client.apps.disable(appId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apps"] });
      toast.success(t("disabled"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isBusy = enableMutation.isPending || disableMutation.isPending;

  const handleToggle = (app: App) => {
    if (app.enabled === false) {
      enableMutation.mutate(app.id);
    } else {
      disableMutation.mutate(app.id);
    }
  };

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("title")}
        actions={
          can("users:write") ? (
            <Button variant="outline" asChild>
              <Link to="/apps/requests">
                <ClipboardList />
                {t("requests.title")}
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* An app is dead until its request is accepted, so the inbox announces
       *  itself from the section too, not only from the sidebar badge. */}
      {can("users:write") && pendingCount > 0 && (
        <Alert>
          <ClipboardList className="h-4 w-4" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <AlertTitle>
                {t("pendingCallout.title", { count: pendingCount })}
              </AlertTitle>
              <AlertDescription>
                {t("pendingCallout.description")}
              </AlertDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/apps/requests">{t("pendingCallout.action")}</Link>
            </Button>
          </div>
        </Alert>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : apps.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {apps.map((app) => {
            const disabled = app.enabled === false;
            return (
              <Card key={app.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-xl">
                      {app.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/apps/${app.id}`}
                        className="text-sm font-medium text-foreground hover:underline"
                      >
                        {app.name}
                      </Link>
                      <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                        {app.description}
                      </p>
                      {/* The health loop probes disabled apps too, so their
                       *  status keeps moving — showing it next to "Disabled"
                       *  would read as a contradiction. */}
                      <div className="mt-2">
                        {disabled ? (
                          <Badge variant="secondary">
                            {t("disabledBadge")}
                          </Badge>
                        ) : (
                          <AppStatusBadge status={app.status ?? "registered"} />
                        )}
                      </div>
                    </div>
                  </div>
                  {can("users:write") && (
                    <div className="mt-4 flex justify-end border-t border-border pt-3">
                      <Button
                        variant={disabled ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleToggle(app)}
                        disabled={isBusy}
                      >
                        {disabled ? t("enable") : t("disable")}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <ResourceEmpty
          resourceName={t("singular").toLowerCase()}
          showCreate={false}
          title={t("empty.title")}
          description={t("empty.description")}
          action={
            can("users:write") ? (
              <Button variant="outline" asChild>
                <Link to="/apps/requests">{t("empty.action")}</Link>
              </Button>
            ) : undefined
          }
        />
      )}
    </section>
  );
}
