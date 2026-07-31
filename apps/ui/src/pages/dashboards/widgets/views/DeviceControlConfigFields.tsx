import type { FC } from "react";
import { useController, type Control, type FieldValues } from "react-hook-form";
import DevicePicker from "@/components/forms/resourcePickers/DevicePicker";
import { standardControlTypes } from "@/pages/devices/standard-devices/registry";

/**
 * Config fields for the device control widget: which device to control.
 *
 * The schema types `device_id` as a string, but a text input asking for one is
 * unusable — the picker lists existing devices by name, which is also what
 * guarantees a saved widget points at a device that exists (deletion after the
 * save is the view's error state to render). Only the types with a registered
 * standard control are offered: the widget renders nothing else, so any other
 * pick could only save an empty tile.
 */
export const DeviceControlConfigFields: FC<{
  control: Control<FieldValues>;
}> = ({ control }) => {
  const { field } = useController({ control, name: "config.device_id" });
  return (
    <DevicePicker
      value={(field.value as string) || undefined}
      onSelect={(device) => field.onChange(device?.id ?? "")}
      filter={{ types: standardControlTypes() }}
      required
    />
  );
};
