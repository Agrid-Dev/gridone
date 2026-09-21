import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { DataType, WriteCondition, WriteExpression } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectItem } from "@/components/ui/select";
import { FieldShell } from "@/components/forms/controllers/FieldShell";
import { EditorSelect } from "./PointPicker";
import { PointSelect } from "./PointSelect";
import {
  defaultScalar,
  expressionKind,
  expressionType,
  isScalar,
  newCondition,
  newExpression,
  sameScalarType,
  scalarType,
  type ConditionKind,
  type ExpressionKind,
  type PointCatalog,
  type Scalar,
} from "./expressions";

type Context = {
  catalog: PointCatalog;
  candidateType?: DataType;
  depth?: number;
};
const conditionKinds: ConditionKind[] = [
  "eq",
  "lt",
  "lte",
  "gt",
  "gte",
  "in",
  "is_known",
  "all",
  "any",
  "not",
];
const expressionKinds: ExpressionKind[] = [
  "point",
  "literal",
  "candidate",
  "add",
  "subtract",
  "min",
  "max",
  "if",
];
const maxEditorDepth = 6;

export function ScalarInput({
  value,
  onChange,
  dataType,
  label,
}: {
  value: Scalar;
  onChange: (value: Scalar) => void;
  dataType?: DataType;
  label: string;
}) {
  const { t } = useTranslation("protections");
  const id = useId();
  const type = dataType ?? scalarType(value);
  if (type === "bool")
    return (
      <EditorSelect
        label={label}
        value={String(value)}
        onChange={(v) => onChange(v === "true")}
      >
        <SelectItem value="true">{t("true")}</SelectItem>
        <SelectItem value="false">{t("false")}</SelectItem>
      </EditorSelect>
    );
  return (
    <FieldShell id={id} label={label} required>
      <Input
        id={id}
        type={type === "str" ? "text" : "number"}
        step={type === "int" ? 1 : "any"}
        value={
          typeof value === "number" && Number.isNaN(value) ? "" : String(value)
        }
        onChange={(e) =>
          onChange(type === "str" ? e.target.value : e.target.valueAsNumber)
        }
        required={type !== "str"}
      />
    </FieldShell>
  );
}

export function ExpressionEditor({
  value,
  onChange,
  catalog,
  candidateType,
  depth = 0,
  expectedType,
  label,
}: Context & {
  value: WriteExpression;
  onChange: (value: WriteExpression) => void;
  expectedType?: DataType;
  label: string;
}) {
  const { t } = useTranslation("protections");
  const kind = expressionKind(value);
  const context = { catalog, candidateType, depth: depth + 1 };
  return (
    <fieldset className="min-w-0 space-y-3 rounded-lg border bg-background p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <EditorSelect
        label={t("expressionType")}
        value={kind}
        onChange={(k) =>
          onChange(newExpression(k as ExpressionKind, expectedType))
        }
      >
        {expressionKinds
          .filter(
            (k) =>
              depth < maxEditorDepth ||
              !["if", "add", "subtract", "min", "max"].includes(k) ||
              k === kind,
          )
          .map((k) => (
            <SelectItem key={k} value={k}>
              {t(`expression.${k}`)}
            </SelectItem>
          ))}
      </EditorSelect>
      {isScalar(value) ? (
        <>
          {!expectedType && (
            <EditorSelect
              label={t("dataType")}
              value={scalarType(value)}
              onChange={(type) => onChange(defaultScalar(type as DataType))}
            >
              {(["bool", "float", "str"] as const).map((type) => (
                <SelectItem key={type} value={type}>
                  {t(`type.${type}`)}
                </SelectItem>
              ))}
            </EditorSelect>
          )}
          <ScalarInput
            label={t("value")}
            value={value}
            dataType={expectedType}
            onChange={onChange}
          />
        </>
      ) : "device_id" in value ? (
        <PointSelect
          label={t("observedPoint")}
          value={value}
          catalog={catalog}
          onChange={onChange}
        />
      ) : "candidate" in value ? (
        <p className="text-sm text-muted-foreground">{t("candidateHelp")}</p>
      ) : "args" in value ? (
        <>
          {value.args.map((arg, i) => (
            <div key={i} className="space-y-2">
              <ExpressionEditor
                {...context}
                label={t("operand", { number: i + 1 })}
                value={arg}
                expectedType="float"
                onChange={(next) =>
                  onChange({
                    ...value,
                    args: value.args.map((v, n) => (n === i ? next : v)),
                  })
                }
              />
              {value.args.length > 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    onChange({
                      ...value,
                      args: value.args.filter((_, n) => n !== i),
                    })
                  }
                >
                  {t("removeOperand")}
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={value.args.length >= 256}
            onClick={() => onChange({ ...value, args: [...value.args, 0] })}
          >
            {t("addOperand")}
          </Button>
        </>
      ) : "then" in value ? (
        <>
          <ConditionEditor
            {...context}
            value={value.condition}
            onChange={(condition) => onChange({ ...value, condition })}
          />
          <ExpressionEditor
            {...context}
            label={t("then")}
            value={value.then}
            expectedType={expectedType}
            onChange={(then) => onChange({ ...value, then })}
          />
          <ExpressionEditor
            {...context}
            label={t("otherwise")}
            value={value.otherwise}
            expectedType={expectedType}
            onChange={(otherwise) => onChange({ ...value, otherwise })}
          />
        </>
      ) : (
        <p role="alert">{t("implicitPoint")}</p>
      )}
    </fieldset>
  );
}

export function ConditionEditor({
  value,
  onChange,
  catalog,
  candidateType,
  depth = 0,
}: Context & {
  value: WriteCondition;
  onChange: (value: WriteCondition) => void;
}) {
  const { t } = useTranslation("protections");
  const context = { catalog, candidateType, depth: depth + 1 };
  const type =
    "left" in value
      ? expressionType(value.left, catalog, candidateType)
      : undefined;
  const numeric = !type || type === "int" || type === "float";
  const replaceExpression = (next: WriteExpression) => {
    if (!("left" in value)) return;
    const nextType = expressionType(next, catalog, candidateType);
    const compatible =
      !nextType ||
      nextType === "int" ||
      nextType === "float" ||
      value.op === "eq";
    onChange({
      ...value,
      op: compatible ? value.op : "eq",
      left: next,
      right:
        isScalar(value.right) &&
        nextType &&
        !sameScalarType(scalarType(value.right), nextType)
          ? defaultScalar(nextType)
          : value.right,
    });
  };
  return (
    <fieldset className="min-w-0 space-y-4 rounded-xl border border-border bg-muted/20 p-4">
      <legend className="px-1 text-sm font-semibold">{t("condition")}</legend>
      <EditorSelect
        label={t("operator")}
        value={value.op}
        onChange={(op) => {
          if ("left" in value && ["eq", "lt", "lte", "gt", "gte"].includes(op))
            onChange({ ...value, op: op as typeof value.op });
          else onChange(newCondition(op as ConditionKind));
        }}
      >
        {conditionKinds
          .filter(
            (op) =>
              (numeric ||
                !["lt", "lte", "gt", "gte"].includes(op) ||
                op === value.op) &&
              (depth < maxEditorDepth ||
                !["all", "any", "not"].includes(op) ||
                op === value.op),
          )
          .map((op) => (
            <SelectItem key={op} value={op}>
              {t(`operatorLabel.${op}`)}
            </SelectItem>
          ))}
      </EditorSelect>
      {"left" in value ? (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <ExpressionEditor
            {...context}
            label={t("left")}
            value={value.left}
            onChange={replaceExpression}
          />
          <ExpressionEditor
            {...context}
            label={t("right")}
            value={value.right}
            expectedType={type}
            onChange={(right) => onChange({ ...value, right })}
          />
        </div>
      ) : "conditions" in value ? (
        <>
          {value.conditions.map((condition, i) => (
            <div key={i} className="space-y-2">
              <ConditionEditor
                {...context}
                value={condition}
                onChange={(next) =>
                  onChange({
                    ...value,
                    conditions: value.conditions.map((v, n) =>
                      n === i ? next : v,
                    ),
                  })
                }
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  onChange({
                    ...value,
                    conditions: value.conditions.filter((_, n) => n !== i),
                  })
                }
              >
                {t("removeCondition", { number: i + 1 })}
              </Button>
            </div>
          ))}
          {!value.conditions.length && (
            <p className="text-sm text-amber-700">
              {t(value.op === "all" ? "emptyAll" : "emptyAny")}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={value.conditions.length >= 256 || depth >= maxEditorDepth}
            onClick={() =>
              onChange({
                ...value,
                conditions: [...value.conditions, newCondition("eq")],
              })
            }
          >
            {t("addCondition")}
          </Button>
        </>
      ) : "condition" in value ? (
        <ConditionEditor
          {...context}
          value={value.condition}
          onChange={(condition) => onChange({ ...value, condition })}
        />
      ) : (
        <>
          <ExpressionEditor
            {...context}
            label={t("observed")}
            value={value.value}
            onChange={(next) => {
              const nextType = expressionType(next, catalog, candidateType);
              onChange(
                "values" in value
                  ? {
                      ...value,
                      value: next,
                      values: value.values.map((item) =>
                        nextType && !sameScalarType(scalarType(item), nextType)
                          ? defaultScalar(nextType)
                          : item,
                      ),
                    }
                  : { ...value, value: next },
              );
            }}
          />
          {"values" in value && (
            <div className="space-y-3">
              {value.values.map((v, i) => (
                <div key={i} className="flex items-end gap-2">
                  <ScalarInput
                    label={t("option", { number: i + 1 })}
                    value={v}
                    dataType={expressionType(
                      value.value,
                      catalog,
                      candidateType,
                    )}
                    onChange={(next) =>
                      onChange({
                        ...value,
                        values: value.values.map((v, n) =>
                          n === i ? next : v,
                        ),
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={t("removeOption", { number: i + 1 })}
                    onClick={() =>
                      onChange({
                        ...value,
                        values: value.values.filter((_, n) => n !== i),
                      })
                    }
                  >
                    ×
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={value.values.length >= 256}
                onClick={() =>
                  onChange({
                    ...value,
                    values: [
                      ...value.values,
                      defaultScalar(
                        expressionType(value.value, catalog, candidateType),
                      ),
                    ],
                  })
                }
              >
                {t("addOption")}
              </Button>
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}
