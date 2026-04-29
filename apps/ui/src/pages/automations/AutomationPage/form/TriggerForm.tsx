import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type Trigger } from "@/api/automations";
import { getTriggerDescriptor } from "../presenters/triggerRegistry";
import { TitlePresenter } from "../presenters/BasePresenter";
import { useTriggerForm } from "./useTriggerForm";
import GenericTriggerFormBody from "./GenericTriggerFormBody";
import { FieldShell } from "@/components/forms/controllers/FieldShell";

interface TriggerFormProps {
  initialValue?: Trigger;
  onSubmit: (trigger: Trigger) => void;
  onCancel: () => void;
}

const TriggerForm: FC<TriggerFormProps> = ({
  initialValue,
  onSubmit,
  onCancel,
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
      {type && schema && (
        <GenericTriggerFormBody
          key={type}
          type={type}
          schema={schema}
          initialValue={initialValueForType}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      )}
    </div>
  );
};

export default TriggerForm;
