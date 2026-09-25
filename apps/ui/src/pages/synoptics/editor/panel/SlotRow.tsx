import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import type { AttributeSlot, Device, SlotValue } from "@gridone/sdk";
import {
  AttributeTargetPicker,
  toPickerTarget,
} from "@/components/forms/targetPicker";
import { formatReading } from "@/components/synoptic/values";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { attributeValueText } from "@/lib/attributeValueLabel";
import { deviceAttributes, type AttributeValue } from "@/lib/devices";
import type { AttributeFields } from "@/lib/faults";
import { boundDevice } from "../document";
import { NumberField } from "./NumberField";

/** The select's values beside the attributes: nothing, a literal, a
 *  reading from another device than the symbol's. */
const NONE = "__none__";
const TEXT = "__text__";
const OTHER = "__other__";
const attrValue = (name: string) => `attr:${name}`;

const NUMERIC = new Set(["int", "float"]);

type SlotRowProps = {
  label: string;
  value: SlotValue | undefined;
  /** The device the symbol stands for, whose attributes the row offers. */
  device: Device | undefined;
  /** Every device, for a reading taken from another one. */
  devices: Device[];
  errors: string[];
  /** A choice made: one step of the history. */
  onChange: (value: SlotValue | undefined) => void;
  /** A keystroke in a text field (`unit`, a bool's wording, a literal):
   *  merged with the others typed in the same field. */
  onType: (value: SlotValue, field: string) => void;
  /** The author is done typing in a field. */
  onSettle: () => void;
};

/**
 * One reading a symbol can show: an attribute of its own device, picked
 * by name with its current value beside it, printed as the plate prints
 * it; else a literal, or a reading from another device through the full
 * target picker. Unit, decimals and a bool's wording fold away under
 * "Format", and only where they mean something: a unit and decimals on a
 * number, words on a bool (the backend refuses decimals on anything else,
 * and a unit after a word or a state reads as noise).
 */
export function SlotRow({
  label,
  value,
  device,
  devices,
  errors,
  onChange,
  onType,
  onSettle,
}: SlotRowProps) {
  const { t, i18n } = useTranslation(["synoptics", "common"]);
  const { t: tCommon } = useTranslation("common");
  const attributeLabel = useAttributeLabel();
  const id = useId();
  const [formatOpen, setFormatOpen] = useState(false);
  const attributes = device ? deviceAttributes(device) : {};
  const own = boundDevice(value);
  const mode = !value
    ? NONE
    : value.kind === "text"
      ? TEXT
      : device && own === device.id
        ? attrValue(value.target.attribute)
        : OTHER;
  // Attributes arrive as an untyped bag; this is the view of one the rest
  // of the UI reads them through.
  const attribute =
    value?.kind === "attribute" && mode !== OTHER
      ? (attributes[value.target.attribute] as AttributeFields | undefined)
      : undefined;
  const dataType =
    typeof attribute?.data_type === "string" ? attribute.data_type : undefined;

  const choose = (next: string) => {
    if (next === NONE) onChange(undefined);
    else if (next === TEXT) onChange({ kind: "text", text: "" });
    else if (next === OTHER) {
      onChange({ kind: "attribute", target: { devices: {}, attribute: "" } });
    } else if (device) {
      const name = next.slice("attr:".length);
      const kind = attributes[name]?.data_type;
      const number = typeof kind === "string" && NUMERIC.has(kind);
      const previous = value?.kind === "attribute" ? value : undefined;
      // What the format said of the last reading carries over only to a
      // reading of the same kind: a unit and decimals to a number, words
      // to a bool.
      onChange({
        kind: "attribute",
        target: { devices: { ids: [device.id] }, attribute: name },
        unit: number ? (previous?.unit ?? null) : null,
        decimals: number ? (previous?.decimals ?? null) : null,
        labels: kind === "bool" ? (previous?.labels ?? null) : null,
      });
    }
  };

  const current = (() => {
    if (!attribute || value?.kind !== "attribute") return null;
    const raw = attribute.current_value as AttributeValue | undefined;
    if (raw === undefined || raw === null) return null;
    // As the plate will print it, so the two never disagree. A bool with
    // no words of its own shows on the plate as a state, not as text: here
    // it reads as the device page would say it.
    const { text, unit } = formatReading(value, raw);
    if (text === null) {
      return attributeValueText(value.target.attribute, raw, tCommon, {
        dataType,
        valueLabels: attribute.value_labels,
        language: i18n.language,
      });
    }
    return unit ? `${text} ${unit}` : text;
  })();

  const attributeNames = Object.keys(attributes)
    .filter((name) => name !== "connection_status")
    .sort((a, b) =>
      attributeLabel(a, attributes[a]).localeCompare(
        attributeLabel(b, attributes[b]),
      ),
    );

  const patch = (fields: Partial<AttributeSlot>, field: string) => {
    if (value?.kind === "attribute") onType({ ...value, ...fields }, field);
  };
  const numeric = mode === OTHER || (dataType ? NUMERIC.has(dataType) : false);
  const bool = mode === OTHER || dataType === "bool";

  return (
    <div className="space-y-2" data-slot-row>
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2">
        <Label htmlFor={`${id}-source`} className="text-sm font-normal">
          {label}
        </Label>
        <Select value={mode} onValueChange={choose}>
          <SelectTrigger id={`${id}-source`} className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t("editor.slot.none")}</SelectItem>
            {attributeNames.map((name) => (
              <SelectItem key={name} value={attrValue(name)}>
                {attributeLabel(name, attributes[name])}
              </SelectItem>
            ))}
            {mode.startsWith("attr:") &&
              !attributeNames.includes(mode.slice(5)) && (
                // A bound attribute the device no longer lists stays visible.
                <SelectItem value={mode}>{mode.slice(5)}</SelectItem>
              )}
            <SelectSeparator />
            <SelectItem value={TEXT}>{t("editor.slot.text")}</SelectItem>
            <SelectItem value={OTHER}>{t("editor.slot.other")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {current !== null && (
        <p className="pl-[6rem] text-xs text-muted-foreground">
          {t("common:common.currentValue")} :{" "}
          <span className="font-medium text-synoptic-reading">{current}</span>
        </p>
      )}
      {value?.kind === "text" && (
        <Input
          aria-label={t("editor.slot.textLabel", { slot: label })}
          value={value.text}
          onChange={(e) =>
            onType({ kind: "text", text: e.target.value }, "text")
          }
          onBlur={onSettle}
        />
      )}
      {value?.kind === "attribute" && mode === OTHER && (
        <AttributeTargetPicker
          value={toPickerTarget(value.target)}
          onChange={(target) =>
            onChange({
              ...value,
              target: { ...target, attribute: target.attribute ?? "" },
            })
          }
          devices={devices}
        />
      )}
      {value?.kind === "attribute" && (numeric || bool) && (
        <div className="pl-[6rem]">
          <button
            type="button"
            aria-expanded={formatOpen}
            onClick={() => setFormatOpen((open) => !open)}
            className="flex items-center gap-1 text-xs font-medium text-primary outline-none focus-visible:underline"
          >
            <ChevronRight
              aria-hidden
              className={`size-3.5 transition-transform ${formatOpen ? "rotate-90" : ""}`}
            />
            {t("editor.slot.format")}
          </button>
          {formatOpen && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {numeric && (
                <div className="space-y-1">
                  <Label htmlFor={`${id}-unit`} className="text-xs">
                    {t("editor.slot.unit")}
                  </Label>
                  <Input
                    id={`${id}-unit`}
                    className="h-8"
                    placeholder={
                      typeof attribute?.unit === "string"
                        ? attribute.unit
                        : undefined
                    }
                    value={value.unit ?? ""}
                    onChange={(e) =>
                      patch({ unit: e.target.value || null }, "unit")
                    }
                    onBlur={onSettle}
                  />
                </div>
              )}
              {numeric && (
                <div className="space-y-1">
                  <Label htmlFor={`${id}-decimals`} className="text-xs">
                    {t("editor.slot.decimals")}
                  </Label>
                  <NumberField
                    id={`${id}-decimals`}
                    className="h-8"
                    min={0}
                    max={6}
                    placeholder={t("editor.slot.decimalsAuto")}
                    value={value.decimals ?? null}
                    onCommit={(decimals) => onChange({ ...value, decimals })}
                  />
                </div>
              )}
              {bool &&
                (["true", "false"] as const).map((key) => (
                  <div key={key} className="space-y-1">
                    <Label htmlFor={`${id}-label-${key}`} className="text-xs">
                      {t(`editor.slot.label.${key}`)}
                    </Label>
                    <Input
                      id={`${id}-label-${key}`}
                      className="h-8"
                      value={value.labels?.[key] ?? ""}
                      onChange={(e) => {
                        const labels = {
                          ...(value.labels ?? {}),
                          [key]: e.target.value,
                        };
                        if (!e.target.value) delete labels[key];
                        patch(
                          {
                            labels: Object.keys(labels).length ? labels : null,
                          },
                          `label-${key}`,
                        );
                      }}
                      onBlur={onSettle}
                    />
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
      {errors.map((error) => (
        <p key={error} className="text-sm text-destructive">
          {error}
        </p>
      ))}
    </div>
  );
}
