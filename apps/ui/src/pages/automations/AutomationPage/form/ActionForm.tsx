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
import type { Severity } from "@/api/severity";
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
  /** Final submit — fires when the user accepts the form (Save click in
   *  edit mode, or the parent's Submit in the create wizard). */
  onSubmit: (result: ActionFormResult) => void;
  /** Continuous result-state callback. Lets a parent gate its own button
   *  on form readiness without re-rendering the body. */
  onChange?: (result: ActionFormResult | null) => void;
  onCancel: () => void;
  formId?: string;
  hideActions?: boolean;
}

/** ``Action`` is the wire shape (``params: Record<string, unknown>``);
 *  ``ActionFormResult`` is the same shape but tightly typed per provider.
 *  Re-validate at the boundary so only well-formed actions seed the form's
 *  ``result`` slot. */
function actionToResult(action: Action | undefined): ActionFormResult | null {
  if (!action) return null;
  if (action.providerId === "command_template") {
    const id = action.params.templateId;
    if (typeof id !== "string") return null;
    return {
      providerId: "command_template",
      params: { templateId: id },
    };
  }
  if (action.providerId === "notification") {
    const { title, body, severity, userIds } = action.params;
    if (typeof title !== "string" || !title.trim()) return null;
    if (typeof severity !== "string") return null;
    if (!Array.isArray(userIds) || userIds.length === 0) return null;
    return {
      providerId: "notification",
      params: {
        title,
        body: typeof body === "string" ? body : "",
        severity: severity as Severity,
        userIds: userIds.filter((id): id is string => typeof id === "string"),
      },
    };
  }
  return null;
}

const ActionForm: FC<ActionFormProps> = ({
  initialValue,
  onSubmit,
  onChange,
  onCancel,
  formId,
  hideActions,
}) => {
  const { t } = useTranslation(["common", "automations"]);
  const [type, setType] = useState<ActionType>("command_template");
  const [result, setResult] = useState<ActionFormResult | null>(() =>
    actionToResult(initialValue),
  );

  const updateResult = (next: ActionFormResult | null) => {
    setResult(next);
    onChange?.(next);
  };

  const handleTypeChange = (next: string) => {
    setType(next as ActionType);
    updateResult(null);
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
        onChange={updateResult}
        formId={formId}
      />
      {!hideActions && (
        <div className="flex align-middle justify-end gap-2 mt-8">
          <Button
            type="button"
            onClick={() => {
              updateResult(actionToResult(initialValue));
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
