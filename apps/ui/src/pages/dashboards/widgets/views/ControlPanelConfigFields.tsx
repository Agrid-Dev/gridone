import { useEffect, type FC } from "react";
import {
  useController,
  useFieldArray,
  useWatch,
  type Control,
  type FieldValues,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { InputController } from "@/components/forms/controllers/InputController";
import { SwitchController } from "@/components/forms/controllers/SwitchController";
import DeviceAttributePicker from "@/components/forms/resourcePickers/DeviceAttributePicker";
import { Button } from "@/components/ui";
import { useValueLabel } from "@/hooks/useValueLabel";
import type { DeviceAttribute } from "@/lib/devices";

/** What a freshly-added row starts from. */
export const BLANK_ATTRIBUTE = { device_id: "", attribute: "", label: null };

/** What a freshly-added section starts from: one row to fill in. */
export const BLANK_SECTION = {
  title: null,
  active_when: null,
  attributes: [BLANK_ATTRIBUTE],
};

/** What a freshly-added condition starts from. */
export const BLANK_CONDITION = {
  device_id: "",
  attribute: "",
  value: true,
  inactive_reason: null,
};

/** The panel takes booleans only, so nothing else is offered. */
const isBoolean = (attribute: DeviceAttribute) =>
  attribute.data_type === "bool";

/**
 * Config fields for the control panel widget: sections, each with an optional
 * title, an optional condition and one or more rows.
 *
 * Hand-written because the schema is nested lists of (device, attribute)
 * pairs: derived from it, every row would be two free-text inputs asking for
 * ids.
 */
export const ControlPanelConfigFields: FC<{
  control: Control<FieldValues>;
}> = ({ control }) => {
  const { t } = useTranslation("dashboards");
  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "config.sections",
  });

  // The generic empty-config builder starts an array empty; a panel needs at
  // least one section, so there is always one to edit.
  useEffect(() => {
    if (fields.length === 0) replace([BLANK_SECTION]);
  }, [fields.length, replace]);

  return (
    <>
      {fields.map((field, index) => (
        <fieldset key={field.id} className="space-y-4 rounded-md border p-4">
          <div className="flex items-center justify-between gap-2">
            <legend className="text-sm font-medium text-muted-foreground">
              {t("widgets.controlPanel.editor.section", { index: index + 1 })}
            </legend>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("widgets.controlPanel.editor.removeSection")}
              disabled={fields.length === 1}
              onClick={() => remove(index)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <SectionFields control={control} name={`config.sections.${index}`} />
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() => append(BLANK_SECTION)}
      >
        <Plus className="mr-1 h-4 w-4" />
        {t("widgets.controlPanel.editor.addSection")}
      </Button>
    </>
  );
};

const SectionFields: FC<{ control: Control<FieldValues>; name: string }> = ({
  control,
  name,
}) => {
  const { t } = useTranslation("dashboards");
  const { fields, append, remove } = useFieldArray({
    control,
    name: `${name}.attributes`,
  });
  return (
    <>
      <InputController
        name={`${name}.title`}
        control={control}
        label={t("widgets.controlPanel.editor.title")}
        emptyAsNull
      />
      <ConditionFields control={control} name={`${name}.active_when`} />
      {fields.map((field, index) => (
        <div key={field.id} className="space-y-3 rounded-md bg-muted/40 p-3">
          <AttributeReferenceFields
            control={control}
            name={`${name}.attributes.${index}`}
          />
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <InputController
                name={`${name}.attributes.${index}.label`}
                control={control}
                label={t("widgets.controlPanel.editor.label")}
                inputProps={{
                  placeholder: t(
                    "widgets.controlPanel.editor.labelPlaceholder",
                  ),
                }}
                emptyAsNull
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("widgets.controlPanel.editor.removeAttribute")}
              disabled={fields.length === 1}
              onClick={() => remove(index)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => append(BLANK_ATTRIBUTE)}
      >
        <Plus className="mr-1 h-4 w-4" />
        {t("widgets.controlPanel.editor.addAttribute")}
      </Button>
    </>
  );
};

/** The (device, boolean attribute) pair a row or a condition points at. */
const AttributeReferenceFields: FC<{
  control: Control<FieldValues>;
  name: string;
}> = ({ control, name }) => {
  const { field: deviceField } = useController({
    control,
    name: `${name}.device_id`,
  });
  const { field: attributeField } = useController({
    control,
    name: `${name}.attribute`,
  });
  return (
    <DeviceAttributePicker
      deviceId={(deviceField.value as string) || undefined}
      attribute={(attributeField.value as string) || undefined}
      attributeFilter={isBoolean}
      onChange={({ deviceId, attribute }) => {
        deviceField.onChange(deviceId);
        attributeField.onChange(attribute);
      }}
      required
    />
  );
};

/** A section's optional condition: absent until asked for, then an attribute,
 *  the reading that makes the section active and the reason shown otherwise. */
const ConditionFields: FC<{ control: Control<FieldValues>; name: string }> = ({
  control,
  name,
}) => {
  const { t } = useTranslation("dashboards");
  const valueLabel = useValueLabel();
  const { field } = useController({ control, name });
  // Watched rather than read off the controller: the fields below register
  // their own paths under this one, which the parent's value never reflects.
  const condition = useWatch({ control, name }) as object | null | undefined;

  if (!condition)
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        // A copy: unlike a field array's `append`, `onChange` stores the
        // object it is given and the fields below then write into it.
        onClick={() => field.onChange({ ...BLANK_CONDITION })}
      >
        <Plus className="mr-1 h-4 w-4" />
        {t("widgets.controlPanel.editor.addCondition")}
      </Button>
    );

  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {t("widgets.controlPanel.editor.condition")}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("widgets.controlPanel.editor.removeCondition")}
          onClick={() => field.onChange(null)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <AttributeReferenceFields control={control} name={name} />
      <SwitchController
        name={`${name}.value`}
        control={control}
        label={t("widgets.controlPanel.editor.conditionValue")}
        sides={{ false: valueLabel(false), true: valueLabel(true) }}
      />
      <InputController
        name={`${name}.inactive_reason`}
        control={control}
        label={t("widgets.controlPanel.editor.inactiveReason")}
        description={t("widgets.controlPanel.editor.inactiveReasonHint")}
        emptyAsNull
      />
    </div>
  );
};
