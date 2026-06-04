import { Bell, Terminal } from "lucide-react";
import { CommandActionForm } from "../form/actionTypes/CommandActionForm";
import { NotificationActionForm } from "../form/actionTypes/NotificationActionForm";
import { CommandActionPresenter } from "./CommandActionPresenter";
import { NotificationPresenter } from "./NotificationPresenter";
import type { ActionDescriptor } from "./types";

/** Action types the user can pick in the automation action form. The select
 *  in ``ActionForm`` enumerates this map and the chosen descriptor's
 *  ``CustomFormRenderer`` is rendered as the body; ``ActionPresenter`` renders
 *  the matching ``Presenter`` in view mode. Adding a new action type means
 *  adding a row here, two i18n keys under ``actions.types.<key>``, a renderer
 *  that emits an ``ActionFormResult``, and a Presenter. */
export const ACTION_PROVIDER_DESCRIPTORS: Record<string, ActionDescriptor> = {
  command_template: {
    icon: Terminal,
    CustomFormRenderer: CommandActionForm,
    Presenter: CommandActionPresenter,
  },
  notification: {
    icon: Bell,
    CustomFormRenderer: NotificationActionForm,
    Presenter: NotificationPresenter,
  },
};

export type ActionType = keyof typeof ACTION_PROVIDER_DESCRIPTORS;

export function getActionDescriptor(type: string): ActionDescriptor {
  return (
    ACTION_PROVIDER_DESCRIPTORS[type] ??
    ACTION_PROVIDER_DESCRIPTORS.command_template
  );
}
