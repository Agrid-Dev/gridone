import * as React from "react";
import {
  useController,
  type FieldPath,
  type FieldValues,
  type UseControllerProps,
} from "react-hook-form";

import { Switch } from "@/components/ui/switch";
import { FieldShell } from "./FieldShell";

type SwitchControllerProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = UseControllerProps<TFieldValues, TName> & {
  label?: React.ReactNode;
  description?: React.ReactNode;
  required?: boolean;
};

export function SwitchController<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  label,
  description,
  required,
  ...controllerProps
}: SwitchControllerProps<TFieldValues, TName>) {
  const { field, fieldState } = useController(controllerProps);

  const id = field.name;

  return (
    <FieldShell
      id={id}
      invalid={fieldState.invalid}
      label={label}
      description={description}
      error={fieldState.error}
      required={required}
    >
      <div className="flex">
        <Switch
          id={id}
          checked={!!field.value}
          onCheckedChange={field.onChange}
          aria-invalid={fieldState.invalid}
          aria-required={required}
        />
      </div>
    </FieldShell>
  );
}
