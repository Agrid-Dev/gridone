import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { usePermissions } from "@/contexts/AuthContext";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import { OperatingRuleSummary } from "./OperatingRuleSummary";
import {
  OperatingRuleDiagnostics,
  OperatingRuleError,
} from "./OperatingRuleFeedback";
import type { AttributeCatalog } from "./expressions";
import {
  isOperatingRuleEnabled,
  operatingRulePath,
  operatingRulesPath,
  useOperatingRule,
  useOperatingRuleDevices,
  useOperatingRuleHistory,
  useOperatingRuleActions,
} from "./useOperatingRules";

function History({ id, catalog }: { id: string; catalog: AttributeCatalog }) {
  const { t, i18n } = useTranslation("operatingRules");
  const { data: history } = useOperatingRuleHistory(id);
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">{t("history")}</h3>
      {history
        .slice()
        .reverse()
        .map((rule) => (
          <details
            key={rule.revision}
            className="rounded-lg border bg-card p-4"
          >
            <summary className="cursor-pointer text-sm">
              {t("revision", { revision: rule.revision })} ·{" "}
              {new Date(rule.updated_at).toLocaleString(i18n.language)} ·{" "}
              {rule.updated_by}
              {` · ${t(rule.deleted_at ? "deleted" : rule.retirement ? "retired" : isOperatingRuleEnabled(rule) ? "active" : "disabled")}`}
            </summary>
            <div className="mt-4 space-y-4">
              <OperatingRuleSummary
                rule={rule}
                catalog={{ ...catalog, contracts: rule.attributes }}
              />
              {rule.retirement && (
                <p className="text-sm">
                  {t("retirementReason")}: {rule.retirement.reason}
                </p>
              )}
            </div>
          </details>
        ))}
    </section>
  );
}

export default function OperatingRuleDetail() {
  const { t, i18n } = useTranslation("operatingRules");
  const can = usePermissions();
  const device = useDeviceFromRoute();
  const { operatingRuleId = "" } = useParams();
  const {
    data: { operating_rule: rule, reasons },
  } = useOperatingRule(device.id, operatingRuleId);
  const { data: devices } = useOperatingRuleDevices();
  const actions = useOperatingRuleActions(rule);
  const enabled = isOperatingRuleEnabled(rule);
  const catalog = { devices, contracts: rule.attributes };
  return (
    <section className="space-y-6">
      <Link
        to={operatingRulesPath(device.id)}
        className="text-sm text-primary hover:underline"
      >
        ← {t("back")}
      </Link>
      <ResourceHeader
        title={rule.name}
        status={
          <Badge variant="outline">{t(enabled ? "active" : "disabled")}</Badge>
        }
        actions={
          can("operating_rules:write") && (
            <>
              <Button
                variant="outline"
                onClick={() => actions.setDeleting(true)}
                disabled={actions.locked}
              >
                <Trash2 className="h-4 w-4" />
                {t("delete")}
              </Button>
              {!rule.retirement && (
                <Button asChild disabled={actions.pending}>
                  <Link to={`${operatingRulePath(rule)}/edit`}>
                    {t("edit")}
                  </Link>
                </Button>
              )}
            </>
          )
        }
      />
      <div className="flex items-center justify-between gap-6 rounded-xl border bg-card p-5">
        <div className="space-y-1">
          <Label htmlFor="operating-rule-enabled" className="font-semibold">
            {t("enabledLabel")}
          </Label>
          <p
            id="operating-rule-enabled-help"
            className="text-sm text-muted-foreground"
          >
            {t(enabled ? "enabledHelp" : "disabledHelp")}
          </p>
        </div>
        <Switch
          id="operating-rule-enabled"
          checked={enabled}
          onCheckedChange={actions.toggle}
          disabled={actions.locked}
          aria-describedby="operating-rule-enabled-help"
        />
      </div>
      {!actions.deleting && <OperatingRuleError error={actions.error} />}
      {!actions.deleting && actions.conflict && (
        <Button
          variant="outline"
          onClick={actions.reload}
          disabled={actions.pending}
        >
          {t("reloadLatest")}
        </Button>
      )}
      <OperatingRuleDiagnostics reasons={reasons} />
      <div className="rounded-xl border bg-card p-5">
        <OperatingRuleSummary rule={rule} catalog={catalog} />
      </div>
      {rule.retirement && (
        <div className="space-y-2 rounded-xl border bg-muted/30 p-5">
          <h3 className="font-semibold">{t("retired")}</h3>
          <p className="whitespace-pre-wrap text-sm">
            {rule.retirement.reason}
          </p>
          <p className="text-sm text-muted-foreground">
            {rule.retirement.actor_id} ·{" "}
            {new Date(rule.retirement.retired_at).toLocaleString(i18n.language)}
          </p>
        </div>
      )}
      <ResourceBoundary resetKeys={[rule.id]}>
        <History id={rule.id} catalog={catalog} />
      </ResourceBoundary>
      <p className="text-sm text-muted-foreground">{t("limits")}</p>
      <Dialog open={actions.deleting} onOpenChange={actions.setDeleting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle", { name: rule.name })}</DialogTitle>
            <DialogDescription>{t("deleteHelp")}</DialogDescription>
          </DialogHeader>
          <OperatingRuleError error={actions.error} />
          {actions.conflict && (
            <Button
              variant="outline"
              onClick={actions.reload}
              disabled={actions.pending}
            >
              {t("reloadLatest")}
            </Button>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => actions.setDeleting(false)}
              disabled={actions.pending}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={actions.remove}
              disabled={actions.locked}
            >
              {t("confirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
