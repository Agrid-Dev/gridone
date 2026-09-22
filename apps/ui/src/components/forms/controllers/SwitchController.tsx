import * as React from "react";
import {
  useController,
  type FieldPath,
  type FieldValues,
  type UseControllerProps,
} from "react-hook-form";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { FieldShell } from "./FieldShell";

/** What each state of the switch means, when the field is not a plain
 *  on / off. */
export type SwitchSides = { false: React.ReactNode; true: React.ReactNode };

type SwitchControllerProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = UseControllerProps<TFieldValues, TName> & {
  label?: React.ReactNode;
  description?: React.ReactNode;
  required?: boolean;
  /** Reads the two states beside the switch, in the field's own vocabulary. */
  sides?: SwitchSides;
  orientation?: React.ComponentProps<typeof FieldShell>["orientation"];
};

export function SwitchController<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  label,
  description,
  required,
  sides,
  orientation,
  ...controllerProps
}: SwitchControllerProps<TFieldValues, TName>) {
  const { field, fieldState } = useController(controllerProps);

  const id = field.name;
  // A field read through two labelled states holds a boolean, so a value left
  // over from another field type reads as neither; a plain switch keeps its
  // truthiness semantics.
  const checked = sides ? field.value === true : !!field.value;

  const sideLabel = (state: boolean, text: React.ReactNode) => (
    <span
      className={cn(
        "text-sm",
        field.value === state
          ? "font-semibold text-foreground"
          : "text-muted-foreground",
      )}
    >
      {text}
    </span>
  );

  return (
    <FieldShell
      id={id}
      invalid={fieldState.invalid}
      label={label}
      description={description}
      error={fieldState.error}
      required={required}
      orientation={orientation}
    >
      <div className={cn("flex items-center", sides && "gap-3")}>
        {sides && sideLabel(false, sides.false)}
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={field.onChange}
          disabled={field.disabled}
          aria-invalid={fieldState.invalid}
          aria-required={required}
        />
        {sides && sideLabel(true, sides.true)}
      </div>
    </FieldShell>
  );
}
