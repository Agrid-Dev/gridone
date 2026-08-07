import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import type { Trigger } from "@gridone/sdk";
import { getTriggerDescriptor } from "../presenters/triggerRegistry";
import { TypePickerCards } from "../../components/TypePickerCards";
import { useTriggerForm } from "./useTriggerForm";
import GenericTriggerFormBody from "./GenericTriggerFormBody";

interface TriggerFormProps {
  initialValue?: Trigger;
  onSubmit: (trigger: Trigger) => void;
  /** Continuous result-state callback — see ``CustomTriggerFormProps``. */
  onChange?: (trigger: Trigger | null) => void;
  onCancel: () => void;
  formId?: string;
  hideActions?: boolean;
  serverError?: unknown;
}

const TriggerForm: FC<TriggerFormProps> = ({
  initialValue,
  onSubmit,
  onChange,
  onCancel,
  formId,
  hideActions,
  serverError,
}) => {
  const { t } = useTranslation("automations");
  const {
    isLoading,
    availableTypes,
    type,
    setType,
    schema,
    initialValueForType,
  } = useTriggerForm(initialValue);

  const descriptor = type ? getTriggerDescriptor(type) : null;
  // ``serverError`` only reaches the generic body, which maps it onto its
  // fields; the page that owns the save is the one that reports the failure.
  const CustomForm = descriptor?.CustomFormRenderer;

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-4">
      <TypePickerCards
        aria-label={t("triggers.type")}
        value={type}
        onSelect={(next) => {
          // Drop the outgoing draft right away: the incoming body only reports
          // its own value once mounted, and it may not be complete.
          setType(next);
          onChange?.(null);
        }}
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
            onChange={onChange}
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
            onChange={onChange}
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
