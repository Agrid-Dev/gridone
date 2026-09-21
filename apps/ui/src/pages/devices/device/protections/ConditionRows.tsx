import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MoreHorizontal, Plus, X } from "lucide-react";
import type { DataType, DevicePointRef, WriteCondition } from "@gridone/sdk";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { attributeUnit } from "@/lib/attributeUnits";
import { ConditionEditor } from "./ConditionEditor";
import { ConditionSummary, WithoutPointIds } from "./ProtectionSummary";
import {
  defaultScalar,
  emptyPoint,
  pointAttribute,
  scalarType,
  type PointCatalog,
  type Scalar,
} from "./expressions";
import {
  comparisonsFor,
  groupOp,
  isGroup,
  isRow,
  rightKind,
  rowPoint,
  rowsOf,
  rowType,
  withComparison,
  withGroupOp,
  withPoint,
  withRightKind,
  withRows,
  type Comparison,
  type MembershipRow,
  type RowCondition,
} from "./conditionShapes";

/** How deep the row editor goes before a condition becomes an expression. */
const maxGroupDepth = 1;
const separator = "/";

const pointKey = (point: DevicePointRef) =>
  `${point.device_id}${separator}${point.attribute}`;
const parsePoint = (key: string): DevicePointRef => {
  const at = key.indexOf(separator);
  return { device_id: key.slice(0, at), attribute: key.slice(at + 1) };
};

/**
 * Device and attribute in one control. The two dependent selects the tree
 * editor uses are correct but cost two decisions for what a reader says as one
 * thing ("primary pump flow"), so the options are grouped by device instead.
 */
export function PointSelect({
  value,
  onChange,
  catalog,
  label,
  writable = false,
  className,
}: {
  value: DevicePointRef;
  onChange: (value: DevicePointRef) => void;
  catalog: PointCatalog;
  label: string;
  writable?: boolean;
  className?: string;
}) {
  const { t } = useTranslation("protections");
  const attributeLabel = useAttributeLabel();
  const selected = pointAttribute(catalog, value);
  const broken = !!value.device_id && !selected;
  // An unset point has no value at all, so the trigger shows its placeholder
  // rather than the empty "/" key that would read as a selection.
  const chosen = value.device_id || value.attribute;
  const select = (
    <Select
      value={chosen ? pointKey(value) : undefined}
      onValueChange={(k) => onChange(parsePoint(k))}
    >
      <SelectTrigger
        aria-label={label}
        aria-invalid={broken}
        className={cn(
          broken ? "w-full border-destructive text-destructive" : className,
        )}
      >
        <SelectValue placeholder={t("choosePoint")} />
      </SelectTrigger>
      <SelectContent>
        {broken && (
          <SelectItem value={pointKey(value)}>
            {t("missing", { id: `${value.device_id}/${value.attribute}` })}
          </SelectItem>
        )}
        {catalog.devices.map((device) => {
          const attributes = Object.entries(device.attributes ?? {}).filter(
            ([, attribute]) =>
              !writable ||
              (Array.isArray(attribute.read_write_modes) &&
                attribute.read_write_modes.includes("write")),
          );
          if (!attributes.length) return null;
          return (
            <SelectGroup key={device.id}>
              <SelectLabel>{device.name}</SelectLabel>
              {attributes.map(([name, attribute]) => (
                <SelectItem
                  key={name}
                  value={pointKey({ device_id: device.id, attribute: name })}
                >
                  {device.name} · {attributeLabel(name, attribute)}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
  if (!broken) return select;
  return (
    <span className={cn("flex min-w-0 flex-col gap-1", className)}>
      {select}
      <span role="status" className="text-xs text-destructive">
        {t("brokenPoint", {
          device: value.device_id,
          attribute: value.attribute,
        })}
      </span>
    </span>
  );
}

/** A typed value field: the type comes from the point, never from a select. */
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
  const { t } = useTranslation("protections");
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

/** The one-line form of a condition: point, comparison, value. */
function SimpleRow({
  value,
  onChange,
  catalog,
  candidateType,
}: {
  value: RowCondition;
  onChange: (value: WriteCondition) => void;
  catalog: PointCatalog;
  candidateType?: DataType;
}) {
  const { t } = useTranslation("protections");
  const point = rowPoint(value);
  const type = rowType(catalog, value);
  const unit = attributeUnit(point.attribute, pointAttribute(catalog, point));
  return (
    <>
      <PointSelect
        label={t("observedPoint")}
        value={point}
        catalog={catalog}
        onChange={(next) => onChange(withPoint(value, next, catalog))}
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
      ) : rightKind(value.right) === "point" ? (
        <PointSelect
          label={t("comparedPoint")}
          value={value.right as DevicePointRef}
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
  const { t } = useTranslation("protections");
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
  const { t } = useTranslation("protections");
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
        {comparing && kind !== "point" && (
          <DropdownMenuItem
            onSelect={() => onChange(withRightKind(value, "point", type))}
          >
            {t("useOtherPoint")}
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
                { op: "eq", left: emptyPoint(), right: false },
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
  catalog: PointCatalog;
  candidateType?: DataType;
}) {
  const { t } = useTranslation("protections");
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 break-words text-sm">
          <WithoutPointIds>
            <ConditionSummary value={value} catalog={catalog} />
          </WithoutPointIds>
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
  catalog: PointCatalog;
  candidateType?: DataType;
  depth: number;
  removable: boolean;
}) {
  const { t } = useTranslation("protections");
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
  catalog: PointCatalog;
  candidateType?: DataType;
  depth: number;
}) {
  const { t } = useTranslation("protections");
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
        {rows.length > 1 && (
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
                { op: "eq", left: emptyPoint(), right: false },
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
                      { op: "eq", left: emptyPoint(), right: false },
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
  catalog: PointCatalog;
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
