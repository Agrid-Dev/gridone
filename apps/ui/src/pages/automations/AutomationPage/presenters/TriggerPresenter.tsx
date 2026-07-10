import { useTranslation } from "react-i18next";
import type { Trigger } from "@gridone/sdk";
import { getTriggerDescriptor } from "./triggerRegistry";
import BasePresenter from "./BasePresenter";

export function TriggerPresenter({ trigger }: { trigger: Trigger }) {
  const { t } = useTranslation("automations");
  const descriptor = getTriggerDescriptor(trigger.provider_id);

  return (
    <BasePresenter
      title={t(`triggers.types.${trigger.provider_id}`, {
        defaultValue: trigger.provider_id,
      })}
      icon={descriptor.icon}
    >
      <descriptor.Presenter trigger={trigger} />
    </BasePresenter>
  );
}
