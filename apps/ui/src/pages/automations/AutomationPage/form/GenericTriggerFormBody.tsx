import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { InputController } from "@/components/forms/controllers/InputController";
import { SwitchController } from "@/components/forms/controllers/SwitchController";
import { toLabel } from "@/lib/textFormat";
import { type Trigger, type TriggerSchema } from "@/api/automations";
import { useGenericTriggerForm } from "./useGenericTriggerForm";

interface GenericTriggerFormBodyProps {
  schema: TriggerSchema;
  initialValue?: Trigger;
  onSave?: (trigger: Trigger) => void;
}

type JsonSchemaProperty = {
  type?: string;
  title?: string;
  description?: string;
};

type SchemaShape = {
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
};

const GenericTriggerFormBody: FC<GenericTriggerFormBodyProps> = ({
  schema,
  initialValue,
  onSave,
}) => {
  const { t } = useTranslation("automations");

  const initialDefaults = initialValue
    ? Object.fromEntries(
        Object.entries(initialValue).filter(([k]) => k !== "type"),
      )
    : undefined;

  const { control, handleSubmit, formState } = useGenericTriggerForm(
    schema,
    initialDefaults,
  );

  const { properties = {}, required = [] } = schema as SchemaShape;
  const requiredSet = new Set(required);

  const onSubmit = (values: Record<string, unknown>) => {
    onSave?.(values);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-4">
        {Object.entries(properties).map(([name, property]) => {
          const label = property.title ?? toLabel(name);
          const isRequired = requiredSet.has(name);

          if (property.type === "boolean") {
            return (
              <SwitchController
                key={name}
                name={name}
                control={control}
                label={label}
                required={isRequired}
                description={property.description}
              />
            );
          }

          if (
            property.type === "string" ||
            property.type === "number" ||
            property.type === "integer"
          ) {
            return (
              <InputController
                key={name}
                name={name}
                control={control}
                label={label}
                type={property.type}
                required={isRequired}
                description={property.description}
              />
            );
          }

          return null;
        })}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={!formState.isValid}>
          {t("common:common.save")}
        </Button>
      </div>
    </form>
  );
};

export default GenericTriggerFormBody;
