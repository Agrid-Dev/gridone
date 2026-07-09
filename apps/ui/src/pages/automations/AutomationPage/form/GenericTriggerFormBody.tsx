import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { InputController } from "@/components/forms/controllers/InputController";
import { SwitchController } from "@/components/forms/controllers/SwitchController";
import { toLabel } from "@/lib/textFormat";
import type { Trigger } from "@gridone/sdk";
import {
  useGenericTriggerForm,
  type TriggerSchema,
} from "./useGenericTriggerForm";

interface GenericTriggerFormBodyProps {
  type: string;
  schema: TriggerSchema;
  initialValue?: Trigger;
  onSubmit: (trigger: Trigger) => void;
  onCancel: () => void;
  formId?: string;
  hideActions?: boolean;
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
  type,
  schema,
  initialValue,
  onSubmit,
  onCancel,
  formId,
  hideActions,
}) => {
  const { t } = useTranslation(["common", "automations"]);

  const initialDefaults = initialValue?.params;

  const { control, handleSubmit, formState } = useGenericTriggerForm(
    schema,
    initialDefaults,
  );

  const { properties = {}, required = [] } = schema as SchemaShape;
  const requiredSet = new Set(required);

  const handleFormSubmit = (values: Record<string, unknown>) => {
    onSubmit({ provider_id: type, params: values });
  };

  return (
    <form
      id={formId}
      onSubmit={handleSubmit(handleFormSubmit)}
      className="space-y-4"
    >
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

      {!hideActions && (
        <div className="flex align-middle justify-end gap-2 mt-8">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("common:common.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={!formState.isValid || !formState.isDirty}
          >
            {t("common:common.save")}
          </Button>
        </div>
      )}
    </form>
  );
};

export default GenericTriggerFormBody;
