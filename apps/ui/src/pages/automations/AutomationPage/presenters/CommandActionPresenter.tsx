import { type FC } from "react";
import type { Action } from "@gridone/sdk";
import CommandTemplatePresenter from "./CommandTemplatePresenter";
import { InlineWritePresenter } from "./InlineWritePresenter";

/** Adapter that lets the ``command_template`` action plug into the registry's
 *  ``action``-shaped Presenter slot: the saved template it references, or
 *  the inline write it carries. */
export const CommandActionPresenter: FC<{ action: Action }> = ({ action }) => {
  const templateId = action.params?.template_id;
  return typeof templateId === "string" ? (
    <CommandTemplatePresenter templateId={templateId} />
  ) : (
    <InlineWritePresenter action={action} />
  );
};

export default CommandActionPresenter;
