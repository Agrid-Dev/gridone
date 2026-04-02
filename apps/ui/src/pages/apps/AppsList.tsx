import { useMemo } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { usePermissions } from "@/contexts/AuthContext";
import { listApps, enableApp, disableApp } from "@/api/apps";
import { listUsers } from "@/api/users";
import { AppStatusBadge } from "./components/AppStatusBadge";

export default function AppsList() {
  const { t } = useTranslation("apps");
  const queryClient = useQueryClient();
  const can = usePermissions();

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["apps"],
    queryFn: listApps,
    refetchInterval: 3_000,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: listUsers,
    enabled: apps.length > 0,
  });

  const blockedUserIds = useMemo(
    () => new Set(users.filter((u) => u.isBlocked).map((u) => u.id)),
    [users],
  );

  const enableMutation = useMutation({
    mutationFn: (appId: string) => enableApp(appId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apps"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("enabled"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const disableMutation = useMutation({
    mutationFn: (appId: string) => disableApp(appId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apps"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("disabled"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isAppDisabled = (userId: string) => blockedUserIds.has(userId);

  const handleToggle = (appId: string, userId: string) => {
    if (isAppDisabled(userId)) {
      enableMutation.mutate(appId);
    } else {
      disableMutation.mutate(appId);
    }
  };

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("subtitle")}
        resourceName={t("title")}
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

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : apps.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {apps.map((app) => {
            const disabled = isAppDisabled(app.userId);
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
                      <div className="mt-2">
                        <AppStatusBadge status={app.status} />
                      </div>
                    </div>
                  </div>
                  {can("users:write") && (
                    <div className="mt-4 flex justify-end border-t border-border pt-3">
                      {disabled ? (
                        <Button
                          size="sm"
                          className="bg-green-600 text-white hover:bg-green-700"
                          onClick={() => handleToggle(app.id, app.userId)}
                          disabled={
                            enableMutation.isPending ||
                            disableMutation.isPending
                          }
                        >
                          {t("enable")}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-red-300 text-red-600 hover:bg-red-50"
                          onClick={() => handleToggle(app.id, app.userId)}
                          disabled={
                            enableMutation.isPending ||
                            disableMutation.isPending
                          }
                        >
                          {t("disable")}
                        </Button>
                      )}
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
        />
      )}
    </section>
  );
}
