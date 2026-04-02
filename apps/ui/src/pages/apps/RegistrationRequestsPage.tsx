import React from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { ConfirmButton } from "@/components/ConfirmButton";
import { usePermissions } from "@/contexts/AuthContext";
import {
  listRegistrationRequests,
  acceptRegistrationRequest,
  discardRegistrationRequest,
} from "@/api/apps";
import type { RegistrationRequest } from "@/api/apps";

const statusStyles: Record<string, string> = {
  pending: "border-amber-200 bg-amber-100 text-amber-800",
  accepted: "border-green-200 bg-green-100 text-green-800",
  discarded: "border-border bg-muted text-muted-foreground",
};

function RequestStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("apps");
  return (
    <Badge variant="outline" className={statusStyles[status]}>
      {t(`requests.${status}`)}
    </Badge>
  );
}

function RequestsTable({
  requests,
  renderRow,
}: {
  requests: RegistrationRequest[];
  renderRow: (req: RegistrationRequest) => React.ReactNode;
}) {
  const { t } = useTranslation("apps");
  const can = usePermissions();
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted">
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">
              {t("requests.username")}
            </th>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">
              {t("requests.appName")}
            </th>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">
              {t("fields.status")}
            </th>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">
              {t("fields.createdAt")}
            </th>
            {can("users:write") && <th className="px-4 py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {requests.map(renderRow)}
        </tbody>
      </table>
    </div>
  );
}

export default function RegistrationRequestsPage() {
  const { t } = useTranslation("apps");
  const queryClient = useQueryClient();
  const can = usePermissions();
  const navigate = useNavigate();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["registration-requests"],
    queryFn: listRegistrationRequests,
  });

  const acceptMutation = useMutation({
    mutationFn: (id: string) => acceptRegistrationRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registration-requests"] });
      queryClient.invalidateQueries({ queryKey: ["apps"] });
      toast.success(t("requests.acceptedToast"));
      navigate("/apps");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const discardMutation = useMutation({
    mutationFn: (id: string) => discardRegistrationRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registration-requests"] });
      toast.success(t("requests.discardedToast"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const renderRow = (req: RegistrationRequest) => {
    const configName = parseConfigName(req.config);
    return (
      <tr key={req.id} className="hover:bg-muted/50">
        <td className="px-4 py-3 text-sm font-medium text-foreground">
          {req.username}
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">
          {configName || "-"}
        </td>
        <td className="px-4 py-3">
          <RequestStatusBadge status={req.status} />
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">
          {new Date(req.createdAt).toLocaleDateString()}
        </td>
        {can("users:write") && req.status === "pending" && (
          <td className="px-4 py-3 text-right">
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => acceptMutation.mutate(req.id)}
                disabled={acceptMutation.isPending}
              >
                <CheckCircle className="h-3.5 w-3.5" />
                {t("requests.accept")}
              </Button>
              <ConfirmButton
                variant="outline"
                size="sm"
                className="text-destructive"
                onConfirm={() => discardMutation.mutate(req.id)}
                confirmTitle={t("requests.discardConfirmTitle")}
                confirmDetails={t("requests.discardConfirmDetails", {
                  name: req.username,
                })}
                icon={<XCircle />}
                disabled={discardMutation.isPending}
              >
                {t("requests.discard")}
              </ConfirmButton>
            </div>
          </td>
        )}
        {can("users:write") && req.status !== "pending" && (
          <td className="px-4 py-3" />
        )}
      </tr>
    );
  };

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("requests.title")}
        resourceName={t("title")}
        resourceNameLinksBack
        backTo="/apps"
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <ResourceEmpty
          resourceName={t("requests.singular").toLowerCase()}
          showCreate={false}
        />
      ) : (
        <RequestsTable requests={requests} renderRow={renderRow} />
      )}
    </section>
  );
}

/**
 * Extracts the app name from the YAML config string.
 * Looks for a "name:" line and returns its value.
 */
function parseConfigName(config: string): string | null {
  if (!config) return null;
  const match = config.match(/^name:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}
