import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import type { Trigger } from "@/api/automations";

export type CustomTriggerFormProps = {
  type: string;
  initialValue?: Trigger;
  onSubmit: (trigger: Trigger) => void;
  onCancel: () => void;
  formId?: string;
  hideActions?: boolean;
};

export type TriggerDescriptor = {
  icon: LucideIcon;
  Presenter: ComponentType<{ trigger: Trigger }>;
  /**
   * Optional custom form for triggers whose JSON schema can't be rendered by
   * the generic body (linked fields, nested objects, ...). When set, the
   * trigger form uses this in place of GenericTriggerFormBody.
   */
  CustomFormRenderer?: ComponentType<CustomTriggerFormProps>;
};
