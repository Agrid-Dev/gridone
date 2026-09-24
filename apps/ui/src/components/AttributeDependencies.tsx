import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, RefreshCw } from "lucide-react";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { Button } from "@/components/ui/button";

/** Refresh observations without weakening the server's write guard. */
export function AttributeDependencies({
  deviceId,
  attribute,
  labels,
}: {
  deviceId: string;
  attribute: string;
  labels: string[];
}) {
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const { t } = useTranslation("devices");
  const refresh = useMutation({
    mutationFn: () => client.devices.refreshAttribute(deviceId, attribute),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["device", deviceId] }),
        queryClient.invalidateQueries({ queryKey: ["devices"] }),
        queryClient.invalidateQueries({ queryKey: ["device-attributes"] }),
      ]);
    },
  });
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      {labels.length > 0 && (
        <p>{t("dependencies.missing", { names: labels.join(", ") })}</p>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={refresh.isPending}
        onClick={() => refresh.mutate()}
      >
        {refresh.isPending ? (
          <Loader2 className="size-3 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="size-3" aria-hidden />
        )}
        {t("dependencies.refresh")}
      </Button>
      {refresh.isError && <p role="alert">{t("dependencies.failed")}</p>}
    </div>
  );
}
