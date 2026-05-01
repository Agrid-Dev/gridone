import { FC, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Controller, useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui";
import { DeviceAttributePicker } from "@/components/forms/resourcePickers/DeviceAttributePicker";
import { getDevice } from "@/api/devices";
import { type Trigger } from "@/api/automations";
import { type CustomTriggerFormProps } from "../presenters/types";
import {
  ConditionEditor,
  defaultConditionFor,
  type Condition,
} from "./ConditionEditor";

const conditionSchema = z.object({
  operator: z.enum(["gt", "lt", "gte", "lte", "eq", "ne"]),
  threshold: z.union([z.number(), z.string(), z.boolean()]),
});

const formSchema = z.object({
  deviceId: z.string().min(1),
  attribute: z.string().min(1),
  // Allow null transiently in form state — the editor needs the dataType to
  // know what shape of threshold to seed, and the dataType only resolves once
  // the picked device has been fetched. The refine below makes save unavailable
  // until the seeding effect populates a Condition.
  condition: z
    .union([conditionSchema, z.null()])
    .refine((v): v is Condition => v !== null, {
      message: "Required",
    }),
});

type FormValues = z.input<typeof formSchema>;

const ChangeEventForm: FC<CustomTriggerFormProps> = ({
  type,
  initialValue,
  onSubmit,
  onCancel,
}) => {
  const { t } = useTranslation("common");

  const { control, handleSubmit, formState, setValue, watch } =
    useForm<FormValues>({
      resolver: zodResolver(formSchema),
      mode: "onChange",
      defaultValues: {
        deviceId:
          typeof initialValue?.deviceId === "string"
            ? initialValue.deviceId
            : "",
        attribute:
          typeof initialValue?.attribute === "string"
            ? initialValue.attribute
            : "",
        condition: extractCondition(initialValue?.condition),
      },
    });

  const { field: deviceField } = useController({ control, name: "deviceId" });
  const { field: attrField } = useController({ control, name: "attribute" });

  const { data: device } = useQuery({
    queryKey: ["devices", deviceField.value],
    queryFn: () => getDevice(deviceField.value),
    enabled: !!deviceField.value,
  });

  const dataType =
    attrField.value && device
      ? device.attributes[attrField.value]?.dataType
      : undefined;

  const condition = watch("condition");

  // Seed a default condition once the watched attribute's dataType resolves.
  // Covers the create flow (condition starts null) and the legacy edit flow
  // where a stored automation has condition = null. shouldDirty: false keeps
  // a fresh edit-flow form clean so accidental saves don't slip in a default
  // the user never touched.
  useEffect(() => {
    if (dataType && condition === null) {
      setValue("condition", defaultConditionFor(dataType), {
        shouldValidate: true,
        shouldDirty: false,
      });
    }
  }, [dataType, condition, setValue]);

  const submit = (values: FormValues) => {
    onSubmit({ type, ...values } as Trigger);
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-6">
      <DeviceAttributePicker
        deviceId={deviceField.value || undefined}
        attribute={attrField.value || undefined}
        onChange={({ deviceId, attribute }) => {
          // Reset the condition when the watched attribute changes — the
          // dataType (and therefore valid threshold shape) may differ. The
          // seeding effect re-populates a default once the new dataType
          // resolves.
          if (attribute !== attrField.value) {
            setValue("condition", null, {
              shouldDirty: true,
              shouldValidate: true,
            });
          }
          deviceField.onChange(deviceId);
          attrField.onChange(attribute);
        }}
        required
      />

      <Controller
        control={control}
        name="condition"
        render={({ field }) => (
          <ConditionEditor
            value={field.value}
            onChange={field.onChange}
            dataType={dataType}
          />
        )}
      />

      <div className="flex align-middle justify-end gap-2 mt-8">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          type="submit"
          disabled={!formState.isValid || !formState.isDirty}
        >
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
};

const OPERATORS = ["gt", "lt", "gte", "lte", "eq", "ne"] as const;

function extractCondition(value: unknown): Condition | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.operator !== "string") return null;
  if (!OPERATORS.includes(v.operator as (typeof OPERATORS)[number])) {
    return null;
  }
  const threshold = v.threshold;
  if (
    typeof threshold !== "number" &&
    typeof threshold !== "string" &&
    typeof threshold !== "boolean"
  ) {
    return null;
  }
  return {
    operator: v.operator as Condition["operator"],
    threshold,
  };
}

export default ChangeEventForm;
export { ChangeEventForm };
