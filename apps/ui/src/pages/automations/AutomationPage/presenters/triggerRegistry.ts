import { changeEventTriggerDescriptor } from "./ChangeEventPresenter";
import { scheduleTriggerDescriptor } from "./SchedulePresenter";
import { unknownTriggerDescriptor } from "./UnknownPresenter";
import type { TriggerDescriptor } from "./types";

export const TRIGGER_PROVIDER_DESCRIPTORS: Record<string, TriggerDescriptor> = {
  schedule: scheduleTriggerDescriptor,
  change_event: changeEventTriggerDescriptor,
};

export function getTriggerDescriptor(type: string): TriggerDescriptor {
  return TRIGGER_PROVIDER_DESCRIPTORS[type] ?? unknownTriggerDescriptor;
}
