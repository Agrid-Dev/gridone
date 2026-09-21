import { useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { OperatingRule } from "@gridone/sdk";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { FieldShell } from "@/components/forms/controllers/FieldShell";
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
import type { PointCatalog } from "./expressions";
import {
  isConflict,
  operatingRulePath,
  operatingRulesPath,
  useOperatingRule,
  useOperatingRuleDevices,
  useOperatingRuleHistory,
  useOperatingRuleSchemas,
  useRetirement,
} from "./useOperatingRules";

function Retirement({
  rule,
  catalog,
  onDone,
}: {
  rule: OperatingRule;
  catalog: PointCatalog;
  onDone: () => void;
}) {
  const { t } = useTranslation("operatingRules");
  const { data: schemas } = useOperatingRuleSchemas();
  const state = useRetirement(rule, schemas, onDone);
  return (
    <form onSubmit={state.submit} className="space-y-4" noValidate>
      <OperatingRuleSummary rule={state.rule} catalog={catalog} />
      <FieldShell
        id="retirement-reason"
        label={t("retirementReason")}
        required
        invalid={!!state.form.formState.errors.reason}
        error={
          state.form.formState.errors.reason
            ? { type: "validate", message: t("required") }
            : undefined
        }
      >
        <Textarea
          id="retirement-reason"
          {...state.form.register("reason")}
          disabled={state.retire.isPending}
          aria-invalid={!!state.form.formState.errors.reason}
        />
      </FieldShell>
      <OperatingRuleError error={state.reload.error ?? state.retire.error} />
      {state.rule.retirement && <p role="status">{t("retiredHelp")}</p>}
      {isConflict(state.retire.error) && (
        <Button
          type="button"
          variant="outline"
          onClick={() => state.reload.mutate()}
          disabled={state.reload.isPending}
        >
          {t("reloadLatest")}
        </Button>
      )}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onDone}
          disabled={state.retire.isPending}
        >
          {t("cancel")}
        </Button>
        <Button
          type="submit"
          variant="destructive"
          disabled={
            state.retire.isPending ||
            state.reload.isPending ||
            !!state.rule.retirement ||
            isConflict(state.retire.error)
          }
        >
          {t("confirmRetirement")}
        </Button>
      </DialogFooter>
    </form>
  );
}

function History({ id, catalog }: { id: string; catalog: PointCatalog }) {
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
              {rule.retirement && ` · ${t("retired")}`}
            </summary>
            <div className="mt-4 space-y-4">
              <OperatingRuleSummary
                rule={rule}
                catalog={{ ...catalog, contracts: rule.points }}
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
  const [retiring, setRetiring] = useState(false);
  const catalog = { devices, contracts: rule.points };
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
          <Badge variant="outline">
            {t(rule.retirement ? "retired" : "active")}
          </Badge>
        }
        actions={
          can("operating_rules:write") &&
          !rule.retirement && (
            <>
              <Button variant="outline" onClick={() => setRetiring(true)}>
                {t("retire")}
              </Button>
              <Button asChild>
                <Link to={`${operatingRulePath(rule)}/edit`}>{t("edit")}</Link>
              </Button>
            </>
          )
        }
      />
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
      <Dialog open={retiring} onOpenChange={setRetiring}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("retire")}</DialogTitle>
            <DialogDescription>{t("retireHelp")}</DialogDescription>
          </DialogHeader>
          {retiring && (
            <ResourceBoundary resetKeys={[rule.id]}>
              <Retirement
                rule={rule}
                catalog={catalog}
                onDone={() => setRetiring(false)}
              />
            </ResourceBoundary>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
