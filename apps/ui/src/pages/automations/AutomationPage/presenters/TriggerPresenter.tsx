import { useTranslation } from "react-i18next";
import type { Trigger } from "@/api/automations";
import { getTriggerDescriptor } from "./triggerRegistry";
import BasePresenter from "./BasePresenter";

export function TriggerPresenter({ trigger }: { trigger: Trigger }) {
  const { t } = useTranslation("automations");
  const descriptor = getTriggerDescriptor(trigger.type);

  return (
    <BasePresenter
      title={t(`triggers.types.${trigger.type}`, {
        defaultValue: trigger.type,
      })}
      icon={descriptor.icon}
    >
      <descriptor.Presenter trigger={trigger} />
    </BasePresenter>
  );
}
