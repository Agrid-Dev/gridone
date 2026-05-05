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
import { TitlePresenter } from "../presenters/BasePresenter";
import {
  ACTION_PROVIDER_DESCRIPTORS,
  getActionDescriptor,
  type ActionType,
} from "../presenters/actionRegistry";
import type { ActionFormResult } from "../presenters/types";

interface ActionFormProps {
  /** Existing action template id when editing an automation. The form opens
   *  in ``command_template`` mode pre-filled with this value. */
  initialValue?: string;
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
  const [type, setType] = useState<ActionType>("command_template");
  const initialResult: ActionFormResult | null = initialValue
    ? { kind: "templateId", templateId: initialValue }
    : null;
  const [result, setResult] = useState<ActionFormResult | null>(initialResult);

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

  const isUnchanged =
    result?.kind === "templateId" && result.templateId === initialValue;

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      <FieldShell id="action-type-picker" label={t("automations:actions.type")}>
        <Select onValueChange={handleTypeChange} value={type}>
          <SelectTrigger className="w-full sm:w-80">
            <SelectValue placeholder={t("automations:actions.type")} />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(ACTION_PROVIDER_DESCRIPTORS).map((typeKey) => {
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
      <Body
        key={type}
        initialValue={
          type === "command_template" ? (initialResult ?? undefined) : undefined
        }
        onChange={setResult}
        formId={formId}
      />
      {!hideActions && (
        <div className="flex align-middle justify-end gap-2 mt-8">
          <Button
            type="button"
            onClick={() => {
              setResult(initialResult);
              onCancel();
            }}
            variant="secondary"
          >
            {t("common:common.cancel")}
          </Button>
          <Button type="submit" disabled={!result || isUnchanged}>
            {t("common:common.save")}
          </Button>
        </div>
      )}
    </form>
  );
};

export default ActionForm;
