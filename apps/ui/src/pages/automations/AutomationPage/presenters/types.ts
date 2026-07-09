import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import type { Action, Trigger } from "@gridone/sdk";
import type { Severity } from "@/lib/severity";

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

/** What an action-type form contributes upward. Structurally an :type:`Action`
 *  but tightly typed per provider so the parent can submit it as-is without
 *  ``params`` casts. Each provider lands as another arm of the union. */
export type ActionFormResult =
  | {
      provider_id: "command_template";
      params: { template_id: string };
    }
  | {
      provider_id: "notification";
      params: {
        title: string;
        body: string;
        severity: Severity;
        user_ids: string[];
      };
    };

export type CustomActionFormProps = {
  /** The automation's existing action when editing, raw off the API.
   *  Bodies pre-populate from it when ``provider_id`` matches what they
   *  render (e.g. the template picker reads ``params.template_id`` for
   *  ``command_template``) and ignore it otherwise. */
  initialValue?: Action;
  onChange: (result: ActionFormResult | null) => void;
  formId?: string;
};

export type ActionDescriptor = {
  icon: LucideIcon;
  CustomFormRenderer: ComponentType<CustomActionFormProps>;
  /** View-mode renderer for a saved action of this provider. */
  Presenter: ComponentType<{ action: Action }>;
};
