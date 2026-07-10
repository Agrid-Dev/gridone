import { type FC } from "react";
import type { Action } from "@gridone/sdk";
import CommandTemplatePresenter from "./CommandTemplatePresenter";

/** Adapter that lets the ``command_template`` action plug into the registry's
 *  ``action``-shaped Presenter slot, extracting the template id it renders. */
export const CommandActionPresenter: FC<{ action: Action }> = ({ action }) => {
  const templateId =
    typeof action.params?.template_id === "string"
      ? action.params.template_id
      : "";
  return <CommandTemplatePresenter templateId={templateId} />;
};

export default CommandActionPresenter;
