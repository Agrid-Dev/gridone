import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Trigger } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { toLabel } from "@/lib/textFormat";
import { formatValue } from "@/lib/formatValue";
import { getTriggerDescriptor } from "../AutomationPage/presenters/triggerRegistry";
import { describeCronExpression } from "../AutomationPage/presenters/cronDescription";
import { isCondition } from "../AutomationPage/presenters/ChangeEventPresenter";
import { RuleChip } from "./RuleChip";

/** One-line, chip-shaped rendering of a trigger. Labels mirror what the full
 *  presenters show, shortened to fit a card row. */
export function TriggerChip({ trigger }: { trigger: Trigger }) {
  const { icon } = getTriggerDescriptor(trigger.provider_id);
  return (
    <RuleChip icon={icon}>
      <TriggerChipLabel trigger={trigger} />
    </RuleChip>
  );
}

function TriggerChipLabel({ trigger }: { trigger: Trigger }) {
  const { t } = useTranslation("automations");
  if (trigger.provider_id === "schedule") {
    return <ScheduleLabel trigger={trigger} />;
  }
  if (trigger.provider_id === "change_event") {
    return <ChangeEventLabel trigger={trigger} />;
  }
  return (
    <>
      {t(`triggers.types.${trigger.provider_id}`, {
        defaultValue: trigger.provider_id,
      })}
    </>
  );
}

function ScheduleLabel({ trigger }: { trigger: Trigger }) {
  const { t, i18n } = useTranslation("automations");
  const cron =
    typeof trigger.params?.cron === "string" ? trigger.params.cron : "";
  const description = describeCronExpression(
    cron,
    i18n?.resolvedLanguage ?? i18n?.language,
  );
  return <>{description ?? t("triggers.types.schedule")}</>;
}

function ChangeEventLabel({ trigger }: { trigger: Trigger }) {
  const { t } = useTranslation("automations");
  const client = useGridoneClient();
  const params = trigger.params ?? {};
  const deviceId = typeof params.device_id === "string" ? params.device_id : "";
  const attribute =
    typeof params.attribute === "string" ? params.attribute : "";
  const condition = isCondition(params.condition) ? params.condition : null;

  const { data: device, isPending } = useQuery({
    queryKey: ["devices", deviceId],
    queryFn: () => client.devices.get(deviceId),
    enabled: !!deviceId,
  });

  const deviceName = device?.name
    ? device.name
    : deviceId && isPending
      ? "…"
      : t("triggers.unknownDevice");
  const conditionText = condition
    ? ` ${t(`operators.${condition.operator}`, { defaultValue: condition.operator })} ${formatValue(condition.threshold)}`
    : "";

  return (
    <>
      {deviceName}
      {attribute && ` · ${toLabel(attribute)}`}
      {conditionText}
    </>
  );
}
