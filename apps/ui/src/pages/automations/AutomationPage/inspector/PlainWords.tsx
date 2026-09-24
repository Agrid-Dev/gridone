import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { Action } from "@gridone/sdk";
import { formatValue } from "@/lib/formatValue";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { ConditionPhrase } from "@/pages/devices/device/operating-rules/RuleSentence";
import { inlineWriteOf, isInlineWrite } from "../presenters/commandShape";
import type { CaseView, DecisionView, OutcomeView } from "../tree/model";
import { useTree } from "../tree/TreeContext";

/** The "in plain words" box at the foot of the panel. */
export function PlainWords({ children }: { children: ReactNode }) {
  const { t } = useTranslation("automations");
  return (
    <div className="mx-5 mb-5 shrink-0 space-y-1.5 rounded-xl border border-primary/25 bg-accent px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-primary">
        {t("panel.plainWords")}
      </p>
      <p className="text-sm leading-6 text-accent-foreground">{children}</p>
    </div>
  );
}

/** "Else if <condition>: <what happens>." for one case. */
export function CaseSentence({ item }: { item: CaseView }) {
  const { t } = useTranslation("automations");
  const { catalog } = useTree();
  const condition = item.branch.condition;
  return (
    <>
      <strong>{t(item.label === "if" ? "tree.if" : "tree.elseIf")}</strong>{" "}
      {condition ? (
        <ConditionPhrase value={condition} catalog={catalog} />
      ) : (
        t("tree.alwaysTrue").toLowerCase()
      )}
      {t("plain.colon")} <OutcomeWords outcome={item.outcome} />.
    </>
  );
}

/** "Otherwise (no case is true): <what happens>." for a decision. */
export function OtherwiseSentence({ decision }: { decision: DecisionView }) {
  const { t } = useTranslation("automations");
  return (
    <>
      <strong>{t("tree.otherwise")}</strong> (
      {t("tree.otherwiseRule").toLowerCase()}){t("plain.colon")}{" "}
      {decision.otherwise.outcome ? (
        <OutcomeWords outcome={decision.otherwise.outcome} />
      ) : (
        t("plain.nothing")
      )}
      .
    </>
  );
}

export function OutcomeWords({ outcome }: { outcome: OutcomeView }) {
  const { t } = useTranslation("automations");
  if (outcome.kind === "empty") return <>{t("plain.noAction")}</>;
  if (outcome.kind === "decision")
    return <>{t("plain.decision", { count: outcome.cases.length })}</>;
  return <ActionWords action={outcome.action} />;
}

function ActionWords({ action }: { action: Action }) {
  const { t } = useTranslation("automations");
  const params = action.params ?? {};
  if (action.provider_id === "command_template")
    return isInlineWrite(action) ? (
      <WriteWords action={action} />
    ) : (
      <TemplateWords
        templateId={
          typeof params.template_id === "string" ? params.template_id : ""
        }
      />
    );
  if (action.provider_id === "notification")
    return (
      <>
        {t("plain.notify", {
          title: typeof params.title === "string" ? params.title : "",
        })}
      </>
    );
  return <>{action.provider_id}</>;
}

function TemplateWords({ templateId }: { templateId: string }) {
  const { t } = useTranslation("automations");
  const client = useGridoneClient();
  const { data: template } = useQuery({
    queryKey: ["command-templates", templateId],
    queryFn: () => client.devices.commandTemplates.get(templateId),
    enabled: !!templateId,
  });
  return (
    <>
      {t("plain.command", {
        name: template?.name || t("tree.commandTemplate"),
      })}
    </>
  );
}

function WriteWords({ action }: { action: Action }) {
  const { t } = useTranslation("automations");
  const { catalog, trigger } = useTree();
  const attributeLabel = useAttributeLabel();
  const write = inlineWriteOf(action);
  const deviceId =
    write?.device_id ??
    (typeof trigger?.params?.device_id === "string"
      ? trigger.params.device_id
      : "");
  const device = catalog.devices.find((item) => item.id === deviceId);
  const attribute = write?.attribute ?? "";
  return (
    <>
      {t("plain.writePrefix", {
        attribute: attributeLabel(attribute, device?.attributes?.[attribute]),
        device: write?.device_id
          ? (device?.name ?? write.device_id)
          : t("plain.eventDevice"),
      })}{" "}
      {write ? formatValue(write.value) : "—"}
    </>
  );
}
