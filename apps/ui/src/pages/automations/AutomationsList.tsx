import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { usePermissions } from "@/contexts/AuthContext";
import {
  disableAutomation,
  enableAutomation,
  listAutomations,
  type Automation,
} from "@/api/automations";
import { AutomationStatusBadge } from "./components/AutomationStatusBadge";

export default function AutomationsList() {
  const { t } = useTranslation("automations");
  const can = usePermissions();
  const queryClient = useQueryClient();

  const { data: automations = [], isLoading } = useQuery({
    queryKey: ["automations"],
    queryFn: () => listAutomations(),
  });

  const enableMutation = useMutation({
    mutationFn: (id: string) => enableAutomation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success(t("toasts.enabled"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const disableMutation = useMutation({
    mutationFn: (id: string) => disableAutomation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success(t("toasts.disabled"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isMutating = enableMutation.isPending || disableMutation.isPending;
  const canWrite = can("automations:write");

  const header = (
    <ResourceHeader
      resourceName={t("title")}
      title={t("subtitle")}
      actions={
        canWrite ? (
          <Button asChild size="sm">
            <Link to="/automations/new">
              <Plus />
              {t("actions.create")}
            </Link>
          </Button>
        ) : undefined
      }
    />
  );

  if (isLoading) {
    return (
      <section className="space-y-6">
        {header}
        <Skeleton className="h-64 w-full rounded-lg" />
      </section>
    );
  }

  if (automations.length === 0) {
    return (
      <section className="space-y-6">
        {header}
        <ResourceEmpty
          resourceName={t("singular").toLowerCase()}
          showCreate={canWrite}
        />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {header}
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>{t("fields.name")}</TableHead>
              <TableHead>{t("fields.trigger")}</TableHead>
              <TableHead>{t("fields.status")}</TableHead>
              {canWrite && <TableHead className="w-32" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {automations.map((automation) => (
              <AutomationRow
                key={automation.id}
                automation={automation}
                canWrite={canWrite}
                isMutating={isMutating}
                onToggle={() =>
                  automation.enabled
                    ? disableMutation.mutate(automation.id)
                    : enableMutation.mutate(automation.id)
                }
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function AutomationRow({
  automation,
  canWrite,
  isMutating,
  onToggle,
}: {
  automation: Automation;
  canWrite: boolean;
  isMutating: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation("automations");
  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link to={`/automations/${automation.id}`} className="hover:underline">
          {automation.name}
        </Link>
      </TableCell>
      <TableCell>
        {t(`triggers.${automation.trigger.type}`, {
          defaultValue: automation.trigger.type,
        })}
      </TableCell>
      <TableCell>
        <AutomationStatusBadge enabled={automation.enabled} />
      </TableCell>
      {canWrite && (
        <TableCell className="text-right">
          <Button
            variant="outline"
            size="sm"
            onClick={onToggle}
            disabled={isMutating}
          >
            {t(automation.enabled ? "actions.disable" : "actions.enable")}
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}
