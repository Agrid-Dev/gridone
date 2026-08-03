import { FC, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Trigger } from "@gridone/sdk";
import { getTriggerDescriptor } from "../presenters/triggerRegistry";
import { TitlePresenter } from "../presenters/BasePresenter";
import { useTriggerForm } from "./useTriggerForm";
import GenericTriggerFormBody from "./GenericTriggerFormBody";
import { FieldShell } from "@/components/forms/controllers/FieldShell";

interface TriggerFormProps {
  initialValue?: Trigger;
  onSubmit: (trigger: Trigger) => void;
  onCancel: () => void;
  formId?: string;
  hideActions?: boolean;
  serverError?: unknown;
}

const TriggerForm: FC<TriggerFormProps> = ({
  initialValue,
  onSubmit,
  onCancel,
  formId,
  hideActions,
  serverError,
}) => {
  const { t } = useTranslation("automations");
  const saveErrorMessage = t("toasts.saveError");
  const {
    isLoading,
    availableTypes,
    type,
    setType,
    schema,
    initialValueForType,
  } = useTriggerForm(initialValue);

  const descriptor = type ? getTriggerDescriptor(type) : null;
  const CustomForm = descriptor?.CustomFormRenderer;

  useEffect(() => {
    if (serverError !== undefined && CustomForm) {
      toast.error(saveErrorMessage);
    }
  }, [CustomForm, saveErrorMessage, serverError]);

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-3">
      <FieldShell id="trigger-type-picker" label={t("triggers.type")}>
        <Select onValueChange={setType} value={type}>
          <SelectTrigger className="w-full sm:w-80">
            <SelectValue placeholder={t("triggers.type")} />
          </SelectTrigger>
          <SelectContent>
            {availableTypes.map((typeKey) => {
              const Icon = getTriggerDescriptor(typeKey).icon;
              return (
                <SelectItem key={typeKey} value={typeKey}>
                  <TitlePresenter
                    icon={Icon}
                    title={t(`triggers.types.${typeKey}`, {
                      defaultValue: typeKey,
                    })}
                  />
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </FieldShell>
      {type &&
        (CustomForm ? (
          <CustomForm
            key={type}
            type={type}
            initialValue={initialValueForType}
            onSubmit={onSubmit}
            onCancel={onCancel}
            formId={formId}
            hideActions={hideActions}
          />
        ) : schema ? (
          <GenericTriggerFormBody
            key={type}
            type={type}
            schema={schema}
            initialValue={initialValueForType}
            onSubmit={onSubmit}
            onCancel={onCancel}
            formId={formId}
            hideActions={hideActions}
            serverError={serverError}
          />
        ) : null)}
    </div>
  );
};

export default TriggerForm;
