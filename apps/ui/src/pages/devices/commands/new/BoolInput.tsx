import type { ResolvedOption, ValueLabel } from "@gridone/sdk";
import { FieldDescription } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { useValueLabel } from "@/hooks/useValueLabel";
import { commandReasons } from "@/lib/commandReasons";
import { cn } from "@/lib/utils";

const STATES = [false, true] as const;

type BoolInputProps = {
  value: unknown;
  onChange: (value: boolean) => void;
  /** The driver's wording of both states; the sides fall back to
   *  False / True when it declares none. */
  valueLabels?: ValueLabel[] | null;
  /** Projected write options: an unavailable state cannot be chosen and its
   *  reasons are listed under the control. */
  options?: ResolvedOption[] | null;
  id?: string;
  "aria-invalid"?: boolean;
};

/** A switch labelled on each side with what the state means for the
 *  attribute, never a generic ON / OFF. Each side is itself a button, so a
 *  state can be picked directly when nothing is chosen yet. */
export function BoolInput({
  value,
  onChange,
  valueLabels,
  options,
  ...switchProps
}: BoolInputProps) {
  const labelFor = useValueLabel();
  const isOn = value === true;
  const unavailable = (state: boolean) =>
    options?.find(
      (option) => option.value === state && option.available === false,
    );
  const side = (state: boolean) => (
    <button
      type="button"
      onClick={() => onChange(state)}
      disabled={!!unavailable(state)}
      className={cn(
        "text-sm disabled:opacity-50",
        value === state
          ? "font-semibold text-foreground"
          : "text-muted-foreground",
      )}
    >
      {labelFor(state, valueLabels)}
    </button>
  );
  return (
    <>
      <div className="inline-flex items-center gap-3">
        {side(false)}
        <Switch
          checked={isOn}
          onCheckedChange={onChange}
          disabled={!!unavailable(!isOn)}
          {...switchProps}
        />
        {side(true)}
      </div>
      {STATES.map((state) => {
        const option = unavailable(state);
        return (
          option && (
            <FieldDescription key={String(state)}>
              {labelFor(state, valueLabels)}: {commandReasons(option.reasons)}
            </FieldDescription>
          )
        );
      })}
    </>
  );
}
