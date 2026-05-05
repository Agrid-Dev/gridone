import { Terminal, Wrench } from "lucide-react";
import { TemplatePickerForm } from "../form/actionTypes/TemplatePickerForm";
import { InlineCommandForm } from "../form/actionTypes/InlineCommandForm";
import type { ActionDescriptor } from "./types";

/** Action types the user can pick in the automation action form. The select
 *  in ``ActionForm`` enumerates this map and the chosen descriptor's
 *  ``CustomFormRenderer`` is rendered as the body. Adding a new action type
 *  (e.g. ``notification``) means adding a row here, two i18n keys under
 *  ``actions.types.<key>``, and a renderer that emits an ``ActionFormResult``. */
export const ACTION_PROVIDER_DESCRIPTORS: Record<string, ActionDescriptor> = {
  command_template: {
    icon: Terminal,
    CustomFormRenderer: TemplatePickerForm,
  },
  command_inline: {
    icon: Wrench,
    CustomFormRenderer: InlineCommandForm,
  },
};

export type ActionType = keyof typeof ACTION_PROVIDER_DESCRIPTORS;

export function getActionDescriptor(type: string): ActionDescriptor {
  return (
    ACTION_PROVIDER_DESCRIPTORS[type] ??
    ACTION_PROVIDER_DESCRIPTORS.command_template
  );
}
