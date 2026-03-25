import { useState } from "react";
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
  discarded: "border-slate-200 bg-slate-100 text-slate-600",
};

function RequestStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <Badge variant="outline" className={statusStyles[status]}>
      {t(`apps.requests.${status}`)}
    </Badge>
  );
}

export default function RegistrationRequestsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const can = usePermissions();
  const navigate = useNavigate();
  const [showArchive, setShowArchive] = useState(false);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["registration-requests"],
    queryFn: listRegistrationRequests,
  });

  const acceptMutation = useMutation({
    mutationFn: (id: string) => acceptRegistrationRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registration-requests"] });
      queryClient.invalidateQueries({ queryKey: ["apps"] });
      toast.success(t("apps.requests.acceptedToast"));
      navigate("/apps");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const discardMutation = useMutation({
    mutationFn: (id: string) => discardRegistrationRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registration-requests"] });
      toast.success(t("apps.requests.discardedToast"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const pending = requests.filter((r) => r.status === "pending");
  const processed = requests.filter((r) => r.status !== "pending");

  const renderRow = (req: RegistrationRequest) => {
    const configName = parseConfigName(req.config);
    return (
      <tr key={req.id} className="hover:bg-slate-50">
        <td className="px-4 py-3 text-sm font-medium text-slate-900">
          {req.username}
        </td>
        <td className="px-4 py-3 text-sm text-slate-500">
          {configName || "-"}
        </td>
        <td className="px-4 py-3">
          <RequestStatusBadge status={req.status} />
        </td>
        <td className="px-4 py-3 text-sm text-slate-500">
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
                {t("apps.requests.accept")}
              </Button>
              <ConfirmButton
                variant="outline"
                size="sm"
                className="text-destructive"
                onConfirm={() => discardMutation.mutate(req.id)}
                confirmTitle={t("apps.requests.discardConfirmTitle")}
                confirmDetails={t("apps.requests.discardConfirmDetails", {
                  name: req.username,
                })}
                icon={<XCircle />}
                disabled={discardMutation.isPending}
              >
                {t("apps.requests.discard")}
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
        title={t("apps.requests.title")}
        resourceName={t("apps.title")}
        resourceNameLinksBack
        backTo="/apps"
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : pending.length === 0 && processed.length === 0 ? (
        <ResourceEmpty
          resourceName={t("apps.requests.singular").toLowerCase()}
        />
      ) : (
        <>
          {/* Pending requests */}
          {pending.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-900">
                {t("apps.requests.pendingTitle")} ({pending.length})
              </h3>
              <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="px-4 py-2 text-left font-medium text-slate-500">
                        {t("apps.requests.username")}
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500">
                        {t("apps.requests.appName")}
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500">
                        {t("apps.fields.status")}
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-slate-500">
                        {t("apps.fields.createdAt")}
                      </th>
                      {can("users:write") && <th className="px-4 py-2" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pending.map(renderRow)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Archive toggle */}
          {processed.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowArchive(!showArchive)}
                className="text-sm font-medium text-slate-500 hover:text-slate-900"
              >
                {showArchive
                  ? t("apps.requests.hideArchive")
                  : t("apps.requests.showArchive", {
                      count: processed.length,
                    })}
              </button>
              {showArchive && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-white overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="px-4 py-2 text-left font-medium text-slate-500">
                          {t("apps.requests.username")}
                        </th>
                        <th className="px-4 py-2 text-left font-medium text-slate-500">
                          {t("apps.requests.appName")}
                        </th>
                        <th className="px-4 py-2 text-left font-medium text-slate-500">
                          {t("apps.fields.status")}
                        </th>
                        <th className="px-4 py-2 text-left font-medium text-slate-500">
                          {t("apps.fields.createdAt")}
                        </th>
                        {can("users:write") && <th className="px-4 py-2" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {processed.map(renderRow)}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
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
