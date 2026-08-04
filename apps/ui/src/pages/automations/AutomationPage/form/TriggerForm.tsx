import { FC, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import type { Trigger } from "@gridone/sdk";
import { getTriggerDescriptor } from "../presenters/triggerRegistry";
import { TypePickerCards } from "../../components/TypePickerCards";
import { useTriggerForm } from "./useTriggerForm";
import GenericTriggerFormBody from "./GenericTriggerFormBody";

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
    <div className="space-y-4">
      <TypePickerCards
        aria-label={t("triggers.type")}
        value={type}
        onSelect={setType}
        options={availableTypes.map((typeKey) => ({
          value: typeKey,
          icon: getTriggerDescriptor(typeKey).icon,
          label: t(`triggers.types.${typeKey}`, { defaultValue: typeKey }),
          description:
            t(`triggers.typeDescriptions.${typeKey}`, { defaultValue: "" }) ||
            undefined,
        }))}
      />
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
