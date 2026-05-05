import { useEffect } from "react";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useDevicesList } from "@/hooks/useDevicesList";
import { useDevice } from "@/hooks/useDevice";
import { type Device } from "@/api/devices";
import { type Trigger } from "@/api/automations";
import { type CustomTriggerFormProps } from "../../presenters/types";
import { defaultConditionFor, type Condition } from "./ConditionEditor";

const conditionSchema = z.object({
  operator: z.enum(["gt", "lt", "gte", "lte", "eq", "ne"]),
  threshold: z.union([z.number(), z.string(), z.boolean()]),
});

const formSchema = z.object({
  deviceId: z.string().min(1),
  attribute: z.string().min(1),
  // Allow null transiently in form state — the editor needs the dataType to
  // know what shape of threshold to seed, and the dataType only resolves once
  // the picked device's data is in cache. The refine below blocks save until
  // the seeding effect populates a Condition.
  condition: z
    .union([conditionSchema, z.null()])
    .refine((v): v is Condition => v !== null, {
      message: "Required",
    }),
});

export type FormValues = z.input<typeof formSchema>;

const OPERATORS = ["gt", "lt", "gte", "lte", "eq", "ne"] as const;

type UseChangeEventFormParams = Pick<
  CustomTriggerFormProps,
  "type" | "initialValue" | "onSubmit"
>;

export function useChangeEventForm({
  type,
  initialValue,
  onSubmit,
}: UseChangeEventFormParams) {
  const params = initialValue?.params;
  const { control, handleSubmit, formState, setValue, watch } =
    useForm<FormValues>({
      resolver: zodResolver(formSchema),
      mode: "onChange",
      defaultValues: {
        deviceId: typeof params?.deviceId === "string" ? params.deviceId : "",
        attribute:
          typeof params?.attribute === "string" ? params.attribute : "",
        condition: extractCondition(params?.condition),
      },
    });

  const { field: deviceField } = useController({ control, name: "deviceId" });
  const { field: attrField } = useController({ control, name: "attribute" });

  // Primary source for the picked attribute's dataType: the cached device list
  // already loaded by DevicePicker. Same query key, no extra request.
  const { devices } = useDevicesList();
  const deviceFromList = devices.find((d) => d.id === deviceField.value);

  const dataTypeFromList = lookupDataType(deviceFromList, attrField.value);

  // Fallback fetch: kicks in only when the list hasn't resolved a dataType yet
  // (e.g. deep-linking into an edit page before the list arrives). Passing
  // `undefined` to useDevice disables it via its internal `enabled: !!deviceId`.
  const { data: deviceFromFetch } = useDevice(
    dataTypeFromList ? undefined : deviceField.value || undefined,
  );

  const device = deviceFromList ?? deviceFromFetch;
  const dataType = lookupDataType(device, attrField.value);

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

  const handlePickerChange = ({
    deviceId,
    attribute,
  }: {
    deviceId: string;
    attribute: string;
  }) => {
    // Reset the condition when the watched attribute changes — the dataType
    // (and therefore valid threshold shape) may differ. The seeding effect
    // re-populates a default once the new dataType resolves.
    if (attribute !== attrField.value) {
      setValue("condition", null, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    deviceField.onChange(deviceId);
    attrField.onChange(attribute);
  };

  const submit = handleSubmit((values: FormValues) => {
    onSubmit({ providerId: type, params: values } as Trigger);
  });

  return {
    control,
    formState,
    submit,
    deviceId: deviceField.value,
    attribute: attrField.value,
    dataType,
    handlePickerChange,
  };
}

// Look up an attribute by its `name` field rather than dict key. Backend ships
// attribute names as snake_case values, but request.ts deep-camelCases dict
// keys — so `device.attributes["temperature_setpoint"]` misses while
// `device.attributes[i].name === "temperature_setpoint"` matches.
function lookupDataType(
  device: Device | undefined,
  attributeName: string | undefined,
): string | undefined {
  if (!device || !attributeName) return undefined;
  return Object.values(device.attributes).find((a) => a.name === attributeName)
    ?.dataType;
}

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
