import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MoreHorizontal, Plus, X } from "lucide-react";
import type {
  DataType,
  DeviceAttributeRef,
  WriteCondition,
} from "@gridone/sdk";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { attributeUnit } from "@/lib/attributeUnits";
import { AttributeSelect } from "./AttributeSelect";
import { ConditionEditor } from "./ConditionEditor";
import { ConditionSummary, WithoutAttributeIds } from "./OperatingRuleSummary";
import {
  defaultScalar,
  emptyAttribute,
  catalogAttribute,
  scalarType,
  type AttributeCatalog,
  type Scalar,
} from "./expressions";
import {
  comparisonsFor,
  groupOp,
  isGroup,
  isRow,
  rightKind,
  rowAttribute,
  rowsOf,
  rowType,
  withComparison,
  withGroupOp,
  withAttribute,
  withRightKind,
  withRows,
  type Comparison,
  type MembershipRow,
  type RowCondition,
} from "./conditionShapes";

/** How deep the row editor goes before a condition becomes an expression. */
const maxGroupDepth = 1;
/** A typed value field: the type comes from the reference, never from a select. */
export function ValueInput({
  value,
  onChange,
  type,
  label,
  unit,
  className,
}: {
  value: Scalar;
  onChange: (value: Scalar) => void;
  type: DataType | undefined;
  label: string;
  unit?: string | null;
  className?: string;
}) {
  const { t } = useTranslation("operatingRules");
  const resolved = type ?? scalarType(value);
  if (resolved === "bool")
    return (
      <Select
        value={String(value)}
        onValueChange={(next) => onChange(next === "true")}
      >
        <SelectTrigger aria-label={label} className={className}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">{t("on")}</SelectItem>
          <SelectItem value="false">{t("off")}</SelectItem>
        </SelectContent>
      </Select>
    );
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      <Input
        aria-label={label}
        type={resolved === "str" ? "text" : "number"}
        step={resolved === "int" ? 1 : "any"}
        required={resolved !== "str"}
        value={
          typeof value === "number" && Number.isNaN(value) ? "" : String(value)
        }
        onChange={(event) =>
          onChange(
            resolved === "str"
              ? event.target.value
              : event.target.valueAsNumber,
          )
        }
      />
      {unit && (
        <span className="shrink-0 text-xs text-muted-foreground">{unit}</span>
      )}
    </span>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={onClick}
      className="shrink-0 text-muted-foreground"
    >
      {children}
    </Button>
  );
}

const rowShell =
  "flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2";

/** The one-line form of a condition: reference, comparison, value. */
function SimpleRow({
  value,
  onChange,
  catalog,
  candidateType,
}: {
  value: RowCondition;
  onChange: (value: WriteCondition) => void;
  catalog: AttributeCatalog;
  candidateType?: DataType;
}) {
  const { t } = useTranslation("operatingRules");
  const reference = rowAttribute(value);
  const type = rowType(catalog, value);
  const unit = attributeUnit(
    reference.attribute,
    catalogAttribute(catalog, reference),
  );
  return (
    <>
      <AttributeSelect
        label={t("observedAttribute")}
        value={reference}
        catalog={catalog}
        onChange={(next) => onChange(withAttribute(value, next, catalog))}
        className="min-w-0 flex-1 basis-56"
      />
      <Select
        value={value.op}
        onValueChange={(op) =>
          onChange(withComparison(value, op as Comparison, type))
        }
      >
        <SelectTrigger
          aria-label={t("comparison.label")}
          className="w-44 shrink-0"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {comparisonsFor(type, value.op).map((op) => (
            <SelectItem key={op} value={op}>
              {t(`comparison.${op}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.op === "is_known" ? (
        <span className="flex-1 text-sm text-muted-foreground">
          {t("noValueNeeded")}
        </span>
      ) : value.op === "in" ? (
        <MembershipValues
          value={value}
          onChange={onChange}
          type={type}
          unit={unit}
        />
      ) : rightKind(value.right) === "attribute" ? (
        <AttributeSelect
          label={t("comparedAttribute")}
          value={value.right as DeviceAttributeRef}
          catalog={catalog}
          onChange={(next) => onChange({ ...value, right: next })}
          className="w-56 shrink-0"
        />
      ) : rightKind(value.right) === "candidate" ? (
        <span className="flex-1 text-sm font-medium">
          {t("expression.candidate")}
        </span>
      ) : (
        <ValueInput
          label={t("comparedValue")}
          value={value.right as Scalar}
          type={type}
          unit={unit}
          onChange={(next) => onChange({ ...value, right: next })}
          className="w-40 shrink-0"
        />
      )}
      <RowMenu
        value={value}
        onChange={onChange}
        type={type}
        candidateType={candidateType}
      />
    </>
  );
}

/** The chips of an "is one of" row. */
function MembershipValues({
  value,
  onChange,
  type,
  unit,
}: {
  value: MembershipRow;
  onChange: (value: WriteCondition) => void;
  type: DataType | undefined;
  unit: string | null;
}) {
  const { t } = useTranslation("operatingRules");
  return (
    <span className="flex flex-1 flex-wrap items-center gap-2">
      {value.values.map((item, index) => (
        <span key={index} className="flex items-center gap-1">
          <ValueInput
            label={t("option", { number: index + 1 })}
            value={item}
            type={type}
            unit={unit}
            onChange={(next) =>
              onChange({
                ...value,
                values: value.values.map((v, n) => (n === index ? next : v)),
              })
            }
            className="w-32"
          />
          {value.values.length > 1 && (
            <IconButton
              label={t("removeOption", { number: index + 1 })}
              onClick={() =>
                onChange({
                  ...value,
                  values: value.values.filter((_, n) => n !== index),
                })
              }
            >
              <X className="h-3.5 w-3.5" />
            </IconButton>
          )}
        </span>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={value.values.length >= 256}
        onClick={() =>
          onChange({ ...value, values: [...value.values, defaultScalar(type)] })
        }
      >
        <Plus className="h-3.5 w-3.5" />
        {t("addOption")}
      </Button>
    </span>
  );
}

/** Everything the one-line row cannot say, one menu deep instead of one box deep. */
function RowMenu({
  value,
  onChange,
  type,
  candidateType,
}: {
  value: RowCondition;
  onChange: (value: WriteCondition) => void;
  type: DataType | undefined;
  candidateType?: DataType;
}) {
  const { t } = useTranslation("operatingRules");
  const comparing = "right" in value;
  const kind = comparing ? rightKind(value.right) : undefined;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("rowOptions")}
          className="shrink-0 text-muted-foreground"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {comparing && kind !== "literal" && (
          <DropdownMenuItem
            onSelect={() => onChange(withRightKind(value, "literal", type))}
          >
            {t("useFixedValue")}
          </DropdownMenuItem>
        )}
        {comparing && kind !== "attribute" && (
          <DropdownMenuItem
            onSelect={() => onChange(withRightKind(value, "attribute", type))}
          >
            {t("useOtherAttribute")}
          </DropdownMenuItem>
        )}
        {comparing && kind !== "candidate" && candidateType && (
          <DropdownMenuItem
            onSelect={() => onChange(withRightKind(value, "candidate", type))}
          >
            {t("useRequestedValue")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            onChange({
              op: "any",
              conditions: [
                value,
                { op: "eq", left: emptyAttribute(), right: false },
              ],
            })
          }
        >
          {t("wrapInGroup")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onChange({ op: "not", condition: value })}
        >
          {t("requireOpposite")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A condition the rows cannot express — a calculation, a conditional value, a
 * group nested past `maxGroupDepth`. It reads as a sentence and opens the
 * expression editor on demand, so no rule shape is lost to the simpler UI.
 */
function AdvancedRow({
  value,
  onChange,
  catalog,
  candidateType,
}: {
  value: WriteCondition;
  onChange: (value: WriteCondition) => void;
  catalog: AttributeCatalog;
  candidateType?: DataType;
}) {
  const { t } = useTranslation("operatingRules");
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 break-words text-sm">
          <WithoutAttributeIds>
            <ConditionSummary value={value} catalog={catalog} />
          </WithoutAttributeIds>
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((was) => !was)}
        >
          {t(open ? "closeExpression" : "editAsExpression")}
        </Button>
      </div>
      {open && (
        <div id={id}>
          <ConditionEditor
            value={value}
            onChange={onChange}
            catalog={catalog}
            candidateType={candidateType}
          />
        </div>
      )}
    </div>
  );
}

function ConditionItem({
  value,
  onChange,
  onRemove,
  catalog,
  candidateType,
  depth,
  removable,
}: {
  value: WriteCondition;
  onChange: (value: WriteCondition) => void;
  onRemove: () => void;
  catalog: AttributeCatalog;
  candidateType?: DataType;
  depth: number;
  removable: boolean;
}) {
  const { t } = useTranslation("operatingRules");
  if (isGroup(value) && depth < maxGroupDepth)
    return (
      <li className="rounded-lg border border-l-4 border-l-primary bg-background p-3">
        <ConditionGroup
          value={value}
          onChange={onChange}
          onRemove={onRemove}
          catalog={catalog}
          candidateType={candidateType}
          depth={depth + 1}
        />
      </li>
    );
  return (
    <li className={rowShell}>
      {isRow(value) ? (
        <SimpleRow
          value={value}
          onChange={onChange}
          catalog={catalog}
          candidateType={candidateType}
        />
      ) : (
        <AdvancedRow
          value={value}
          onChange={onChange}
          catalog={catalog}
          candidateType={candidateType}
        />
      )}
      {removable && (
        <IconButton label={t("removeThisCondition")} onClick={onRemove}>
          <X className="h-4 w-4" />
        </IconButton>
      )}
    </li>
  );
}

/** "All / Any of these are true", then the conditions it combines. */
function ConditionGroup({
  value,
  onChange,
  onRemove,
  catalog,
  candidateType,
  depth,
}: {
  value: WriteCondition;
  onChange: (value: WriteCondition) => void;
  onRemove?: () => void;
  catalog: AttributeCatalog;
  candidateType?: DataType;
  depth: number;
}) {
  const { t } = useTranslation("operatingRules");
  const rows = rowsOf(value);
  const op = groupOp(value) ?? "all";
  const replace = (index: number, next: WriteCondition) =>
    onChange(
      withRows(
        value,
        rows.map((row, n) => (n === index ? next : row)),
      ),
    );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(rows.length > 1 || isGroup(value)) && (
          <>
            <div
              role="group"
              aria-label={t("combineLabel")}
              className="inline-flex rounded-lg bg-muted p-0.5"
            >
              {(["all", "any"] as const).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  aria-pressed={op === choice}
                  onClick={() => onChange(withGroupOp(value, choice))}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                    op === choice
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  {t(`combine.${choice}`)}
                </button>
              ))}
            </div>
            <span className="text-sm text-muted-foreground">
              {t("ofTheseAreTrue")}
            </span>
          </>
        )}
        {onRemove && (
          <IconButton label={t("removeGroup")} onClick={onRemove}>
            <X className="h-4 w-4" />
          </IconButton>
        )}
      </div>
      {!rows.length && (
        <p className="text-sm text-amber-700">
          {t(op === "all" ? "emptyAll" : "emptyAny")}
        </p>
      )}
      <ul className="m-0 list-none space-y-2 p-0">
        {rows.map((row, index) => (
          <ConditionItem
            key={index}
            value={row}
            onChange={(next) => replace(index, next)}
            onRemove={() =>
              onChange(
                withRows(
                  value,
                  rows.filter((_, n) => n !== index),
                ),
              )
            }
            catalog={catalog}
            candidateType={candidateType}
            depth={depth}
            removable={rows.length > 1}
          />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={rows.length >= 256}
          onClick={() =>
            onChange(
              withRows(value, [
                ...rows,
                { op: "eq", left: emptyAttribute(), right: false },
              ]),
            )
          }
        >
          <Plus className="h-4 w-4" />
          {t("addCondition")}
        </Button>
        {depth < maxGroupDepth && (
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              onChange(
                withRows(value, [
                  ...rows,
                  {
                    op: "any",
                    conditions: [
                      { op: "eq", left: emptyAttribute(), right: false },
                    ],
                  },
                ]),
              )
            }
          >
            {t("addGroup")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function ConditionRows({
  value,
  onChange,
  catalog,
  candidateType,
}: {
  value: WriteCondition;
  onChange: (value: WriteCondition) => void;
  catalog: AttributeCatalog;
  candidateType?: DataType;
}) {
  return (
    <ConditionGroup
      value={value}
      onChange={onChange}
      catalog={catalog}
      candidateType={candidateType}
      depth={0}
    />
  );
}
