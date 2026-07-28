import type { FC } from "react";
import { useController, type Control, type FieldValues } from "react-hook-form";
import { DeviceAttributePicker } from "@/components/forms/resourcePickers/DeviceAttributePicker";

/**
 * Config fields for the chart widget: which device, which attribute.
 *
 * These two are picked together — an attribute only means something against a
 * device — so a shared picker owns both fields rather than the schema-driven
 * one-input-per-property default, which would render a device id as free text.
 */
export const ChartConfigFields: FC<{ control: Control<FieldValues> }> = ({
  control,
}) => {
  const { field: deviceField } = useController({
    control,
    name: "config.device_id",
  });
  const { field: attributeField } = useController({
    control,
    name: "config.attribute",
  });

  return (
    <DeviceAttributePicker
      deviceId={(deviceField.value as string) || undefined}
      attribute={(attributeField.value as string) || undefined}
      onChange={({ deviceId, attribute }) => {
        deviceField.onChange(deviceId);
        attributeField.onChange(attribute);
      }}
      required
    />
  );
};
