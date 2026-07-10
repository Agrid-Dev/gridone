import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Plus } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { usePermissions } from "@/contexts/AuthContext";
import type { Automation } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { AutomationStatusBadge } from "./components/AutomationStatusBadge";

export default function AutomationsList() {
  const { t } = useTranslation("automations");
  const can = usePermissions();
  const queryClient = useQueryClient();
  const client = useGridoneClient();

  const { data: automations = [], isLoading } = useQuery({
    queryKey: ["automations"],
    queryFn: () => client.automations.list(),
  });

  const enableMutation = useMutation({
    mutationFn: (id: string) => client.automations.enable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success(t("toasts.enabled"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const disableMutation = useMutation({
    mutationFn: (id: string) => client.automations.disable(id),
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
      title={t("title")}
      caption={t("caption")}
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
              {canWrite && <TableHead className="w-12" />}
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
                    ? disableMutation.mutate(automation.id!)
                    : enableMutation.mutate(automation.id!)
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
        {automation.description && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
            {automation.description}
          </p>
        )}
      </TableCell>
      <TableCell>
        {t(`triggers.types.${automation.trigger.provider_id}`, {
          defaultValue: automation.trigger.provider_id,
        })}
      </TableCell>
      <TableCell>
        <AutomationStatusBadge enabled={automation.enabled ?? true} />
      </TableCell>
      {canWrite && (
        <TableCell className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={t("actions.rowMenu")}
                disabled={isMutating}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onToggle}>
                {t(automation.enabled ? "actions.disable" : "actions.enable")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      )}
    </TableRow>
  );
}
