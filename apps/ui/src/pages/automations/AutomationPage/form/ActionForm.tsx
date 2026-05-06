import { FC, FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldShell } from "@/components/forms/controllers/FieldShell";
import type { Action } from "@/api/automations";
import { TitlePresenter } from "../presenters/BasePresenter";
import {
  ACTION_PROVIDER_DESCRIPTORS,
  getActionDescriptor,
  type ActionType,
} from "../presenters/actionRegistry";
import type { ActionFormResult } from "../presenters/types";

interface ActionFormProps {
  /** Existing action when editing an automation, raw off ``automation.action``.
   *  The form opens in the matching descriptor's body and lets the body
   *  pre-populate from it. ``undefined`` opens a fresh form. */
  initialValue?: Action;
  onSubmit: (result: ActionFormResult) => void;
  onCancel: () => void;
  formId?: string;
  hideActions?: boolean;
}

const ActionForm: FC<ActionFormProps> = ({
  initialValue,
  onSubmit,
  onCancel,
  formId,
  hideActions,
}) => {
  const { t } = useTranslation(["common", "automations"]);
  // Default to ``command_template`` for both the create flow and unrecognized
  // providers. Once the inline-command body is wired (Step 4), the descriptor
  // registry collapses to a single command entry and this useState becomes
  // moot.
  const [type, setType] = useState<ActionType>("command_template");
  const [result, setResult] = useState<ActionFormResult | null>(null);

  const handleTypeChange = (next: string) => {
    setType(next as ActionType);
    setResult(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (result) onSubmit(result);
  };

  const descriptor = getActionDescriptor(type);
  const Body = descriptor.CustomFormRenderer;
  const actionTypes = Object.keys(ACTION_PROVIDER_DESCRIPTORS);
  const showTypePicker = actionTypes.length > 1;

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      {showTypePicker && (
        <FieldShell
          id="action-type-picker"
          label={t("automations:actions.type")}
        >
          <Select onValueChange={handleTypeChange} value={type}>
            <SelectTrigger className="w-full sm:w-80">
              <SelectValue placeholder={t("automations:actions.type")} />
            </SelectTrigger>
            <SelectContent>
              {actionTypes.map((typeKey) => {
                const Icon = getActionDescriptor(typeKey).icon;
                return (
                  <SelectItem key={typeKey} value={typeKey}>
                    <TitlePresenter
                      icon={Icon}
                      title={t(`automations:actions.types.${typeKey}`, {
                        defaultValue: typeKey,
                      })}
                    />
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </FieldShell>
      )}
      <Body
        key={type}
        initialValue={initialValue}
        onChange={setResult}
        formId={formId}
      />
      {!hideActions && (
        <div className="flex align-middle justify-end gap-2 mt-8">
          <Button
            type="button"
            onClick={() => {
              setResult(null);
              onCancel();
            }}
            variant="secondary"
          >
            {t("common:common.cancel")}
          </Button>
          <Button type="submit" disabled={!result}>
            {t("common:common.save")}
          </Button>
        </div>
      )}
    </form>
  );
};

export default ActionForm;
