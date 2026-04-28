import { useTranslation } from "react-i18next";
import type { Trigger } from "@/api/automations";
import { scheduleTriggerDescriptor } from "./SchedulePresenter";
import { changeEventTriggerDescriptor } from "./ChangeEventPresenter";
import { unknownTriggerDescriptor } from "./UnknownPresenter";
import type { TriggerDescriptor } from "./types";
import BasePresenter from "./BasePresenter";

const TRIGGER_PROVIDER_DESCRIPTORS: Record<string, TriggerDescriptor> = {
  schedule: scheduleTriggerDescriptor,
  change_event: changeEventTriggerDescriptor,
};

export function TriggerPresenter({ trigger }: { trigger: Trigger }) {
  const { t } = useTranslation("automations");
  const descriptor =
    TRIGGER_PROVIDER_DESCRIPTORS[trigger.type] ?? unknownTriggerDescriptor;

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
