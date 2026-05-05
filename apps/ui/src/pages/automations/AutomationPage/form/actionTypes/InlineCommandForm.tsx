import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { CommandWizard } from "@/pages/devices/commands/new/CommandWizard";
import { useCommandWizard } from "@/pages/devices/commands/new/useCommandWizard";
import type { CustomActionFormProps } from "../../presenters/types";

export const InlineCommandForm: FC<CustomActionFormProps> = ({ onChange }) => {
  const { t } = useTranslation(["automations", "common"]);
  const wizard = useCommandWizard({ skipReview: true });

  if (wizard.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    // Left margin + border signals nesting inside the action card; the
    // wizard's stepper Next/Back buttons stay inside the bordered area.
    <div className="ml-2 border-l-2 border-muted pl-4">
      <CommandWizard
        wizard={wizard}
        submit={{
          label: t("automations:actions.useCommand"),
          onSubmit: (payload) => onChange({ kind: "inlineCommand", payload }),
        }}
        // When the user re-opens the wizard to tweak the command, drop
        // the parent's stale payload until they re-confirm. Keeps the
        // automation form's Save gated against unverified state.
        onReopen={() => onChange(null)}
        onCancel={() => onChange(null)}
      />
    </div>
  );
};
