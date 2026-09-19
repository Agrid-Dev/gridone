import type { FC } from "react";
import { useTranslation } from "react-i18next";
import type { AttributeSlot, Device, SlotValue } from "@gridone/sdk";
import {
  AttributeTargetPicker,
  toPickerTarget,
} from "@/components/forms/targetPicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SlotEditorProps = {
  id: string;
  label: string;
  value: SlotValue | undefined;
  /** The attribute arm only: a pipe's `flow` has nothing to read from a
   *  literal, so the format refuses one there. */
  attributeOnly?: boolean;
  devices: Device[];
  errors?: string[];
  onChange: (value: SlotValue | undefined) => void;
};

type Kind = "none" | "attribute" | "text";

const EMPTY_ATTRIBUTE: AttributeSlot = {
  kind: "attribute",
  target: { devices: {}, attribute: "" },
};

/** A number field's text as the document stores it: null while blank,
 *  whole for an integer field, since `2.5` in a strict integer is refused
 *  at save with nothing on screen to correct. */
export const readNumber = (type: "integer" | "number", text: string) =>
  text === ""
    ? null
    : type === "integer"
      ? Math.trunc(Number(text))
      : Number(text);

/** One binding: nothing, a device attribute through the shared target
 *  picker with its unit, decimals and the words a bool reads as, or a
 *  literal. */
export const SlotEditor: FC<SlotEditorProps> = ({
  id,
  label,
  value,
  attributeOnly = false,
  devices,
  errors = [],
  onChange,
}) => {
  const { t } = useTranslation("synoptics");
  const kind: Kind = value?.kind ?? "none";
  const setKind = (next: Kind) => {
    if (next === "none") onChange(undefined);
    else if (next === "text") onChange({ kind: "text", text: "" });
    else onChange(EMPTY_ATTRIBUTE);
  };
  const patch = (fields: Partial<AttributeSlot>) => {
    if (value?.kind === "attribute") onChange({ ...value, ...fields });
  };
  const labels = value?.kind === "attribute" ? (value.labels ?? {}) : {};

  return (
    <fieldset className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <legend className="text-sm font-medium">{label}</legend>
        <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
          <SelectTrigger id={`${id}-kind`} className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("editor.slot.none")}</SelectItem>
            <SelectItem value="attribute">
              {t("editor.slot.attribute")}
            </SelectItem>
            {!attributeOnly && (
              <SelectItem value="text">{t("editor.slot.text")}</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
      {value?.kind === "text" && (
        <Input
          aria-label={t("editor.slot.text")}
          value={value.text}
          onChange={(e) => onChange({ kind: "text", text: e.target.value })}
        />
      )}
      {value?.kind === "attribute" && (
        <div className="space-y-3">
          <AttributeTargetPicker
            value={toPickerTarget(value.target)}
            onChange={(target) =>
              patch({
                target: { ...target, attribute: target.attribute ?? "" },
              })
            }
            devices={devices}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`${id}-unit`}>{t("editor.slot.unit")}</Label>
              <Input
                id={`${id}-unit`}
                value={value.unit ?? ""}
                onChange={(e) => patch({ unit: e.target.value || null })}
              />
            </div>
            <div>
              <Label htmlFor={`${id}-decimals`}>
                {t("editor.slot.decimals")}
              </Label>
              <Input
                id={`${id}-decimals`}
                type="number"
                min={0}
                step={1}
                value={value.decimals ?? ""}
                onChange={(e) =>
                  patch({ decimals: readNumber("integer", e.target.value) })
                }
              />
            </div>
            {(["true", "false"] as const).map((key) => (
              <div key={key}>
                <Label htmlFor={`${id}-label-${key}`}>
                  {t(`editor.slot.label.${key}`)}
                </Label>
                <Input
                  id={`${id}-label-${key}`}
                  value={labels[key] ?? ""}
                  onChange={(e) => {
                    const next = { ...labels, [key]: e.target.value };
                    if (!e.target.value) delete next[key];
                    patch({
                      labels: Object.keys(next).length ? next : null,
                    });
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      {errors.map((error) => (
        <p key={error} className="text-sm text-destructive">
          {error}
        </p>
      ))}
    </fieldset>
  );
};
