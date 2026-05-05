import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import type { Trigger } from "@/api/automations";
import type { CommandTemplateCreatePayload } from "@/api/commands";

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

/** What an action-type form contributes upward. The host (ActionForm) collects
 *  one of these from the active descriptor and hands it to the parent's submit
 *  flow. ``templateId`` reuses an existing template; ``inlineCommand`` carries
 *  the payload for a template the parent will create on the fly. A future
 *  ``notification`` kind slots in here without further refactor. */
export type ActionFormResult =
  | { kind: "templateId"; templateId: string }
  | { kind: "inlineCommand"; payload: CommandTemplateCreatePayload };

export type CustomActionFormProps = {
  initialValue?: ActionFormResult;
  onChange: (result: ActionFormResult | null) => void;
  formId?: string;
};

export type ActionDescriptor = {
  icon: LucideIcon;
  CustomFormRenderer: ComponentType<CustomActionFormProps>;
};
