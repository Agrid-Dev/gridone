import { type FC } from "react";
import type { Action } from "@/api/automations";
import CommandTemplatePresenter from "./CommandTemplatePresenter";

/** Adapter that lets the ``command_template`` action plug into the registry's
 *  ``action``-shaped Presenter slot, extracting the templateId it renders. */
export const CommandActionPresenter: FC<{ action: Action }> = ({ action }) => {
  const templateId =
    typeof action.params.templateId === "string"
      ? action.params.templateId
      : "";
  return <CommandTemplatePresenter templateId={templateId} />;
};

export default CommandActionPresenter;
