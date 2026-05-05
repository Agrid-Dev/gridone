import { FC } from "react";
import { useTranslation } from "react-i18next";
import type { CustomActionFormProps } from "../../presenters/types";

/** Placeholder body for the ``command_inline`` action type. The composer that
 *  lets the user define a command on the fly lands in commit 2 — until then,
 *  this body emits no result, which keeps the action form's submit gated. */
export const InlineCommandForm: FC<CustomActionFormProps> = () => {
  const { t } = useTranslation("automations");
  return (
    <p className="text-sm text-muted-foreground">
      {t("actions.types.command_inline_comingSoon")}
    </p>
  );
};
