import { FC, useId } from "react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import { FieldShell } from "@/components/forms/controllers/FieldShell";

export type ConditionOperator = "gt" | "lt" | "gte" | "lte" | "eq" | "ne";
export type Threshold = number | string | boolean;
export type Condition = {
  operator: ConditionOperator;
  threshold: Threshold;
};

const ALL_OPERATORS: ConditionOperator[] = [
  "gt",
  "lt",
  "gte",
  "lte",
  "eq",
  "ne",
];
const BOOL_OPERATORS: ConditionOperator[] = ["eq", "ne"];

interface ConditionEditorProps {
  value: Condition | null;
  onChange: (next: Condition | null) => void;
  /** Data type of the watched attribute. Drives the threshold input shape and
   *  the available operators. Undefined while no attribute is picked or its
   *  device hasn't loaded yet. */
  dataType: string | undefined;
  disabled?: boolean;
}

export const ConditionEditor: FC<ConditionEditorProps> = ({
  value,
  onChange,
  dataType,
  disabled,
}) => {
  const { t } = useTranslation("automations");
  const switchId = useId();
  const operatorId = useId();
  const thresholdId = useId();

  const enabled = value !== null;
  const hasDataType = !!dataType;
  const operators = operatorsFor(dataType);

  const handleToggle = (next: boolean) => {
    if (next) {
      onChange({
        operator: operators[0] ?? "eq",
        threshold: defaultThreshold(dataType),
      });
    } else {
      onChange(null);
    }
  };

  const handleOperatorChange = (operator: ConditionOperator) => {
    if (!value) return;
    onChange({ ...value, operator });
  };

  const handleThresholdChange = (threshold: Threshold) => {
    if (!value) return;
    onChange({ ...value, threshold });
  };

  return (
    <div className="space-y-3">
      <Field>
        <div className="flex items-center gap-3">
          <Switch
            id={switchId}
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={disabled || !hasDataType}
          />
          <FieldLabel htmlFor={switchId} className="cursor-pointer">
            {t("triggers.addCondition")}
          </FieldLabel>
        </div>
      </Field>

      {enabled && value && hasDataType && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
          <FieldShell id={operatorId} label={t("triggers.operator")} required>
            <Select
              value={value.operator}
              onValueChange={(v) =>
                handleOperatorChange(v as ConditionOperator)
              }
              disabled={disabled}
            >
              <SelectTrigger id={operatorId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {operators.map((op) => (
                  <SelectItem key={op} value={op}>
                    <span className="font-mono">
                      {t(`operators.${op}`, { defaultValue: op })}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldShell>

          <FieldShell id={thresholdId} label={t("triggers.threshold")} required>
            <ThresholdInput
              id={thresholdId}
              value={value.threshold}
              onChange={handleThresholdChange}
              dataType={dataType}
              disabled={disabled}
            />
          </FieldShell>
        </div>
      )}
    </div>
  );
};

function operatorsFor(dataType: string | undefined): ConditionOperator[] {
  return dataType === "bool" ? BOOL_OPERATORS : ALL_OPERATORS;
}

function defaultThreshold(dataType: string | undefined): Threshold {
  switch (dataType) {
    case "bool":
      return false;
    case "int":
    case "float":
      return 0;
    default:
      return "";
  }
}

interface ThresholdInputProps {
  id: string;
  value: Threshold;
  onChange: (value: Threshold) => void;
  dataType: string;
  disabled?: boolean;
}

const ThresholdInput: FC<ThresholdInputProps> = ({
  id,
  value,
  onChange,
  dataType,
  disabled,
}) => {
  if (dataType === "bool") {
    return (
      <Switch
        id={id}
        checked={value === true}
        onCheckedChange={(v) => onChange(v)}
        disabled={disabled}
      />
    );
  }
  if (dataType === "int" || dataType === "float") {
    return (
      <Input
        id={id}
        type="number"
        step={dataType === "int" ? 1 : "any"}
        value={typeof value === "number" ? value : ""}
        onChange={(e) => {
          const raw = e.currentTarget.value;
          if (raw === "") return onChange(0);
          const n = e.currentTarget.valueAsNumber;
          onChange(Number.isNaN(n) ? 0 : n);
        }}
        disabled={disabled}
      />
    );
  }
  return (
    <Input
      id={id}
      type="text"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.currentTarget.value)}
      disabled={disabled}
    />
  );
};

export default ConditionEditor;
