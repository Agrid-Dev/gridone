import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  DevicePointRef,
  OperatingRuleDefinition,
  WriteCondition,
  WriteExpression,
} from "@gridone/sdk";
import { cn } from "@/lib/utils";
import { attributeUnit } from "@/lib/attributeUnits";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { isScalar, pointAttribute, type PointCatalog } from "./expressions";
import { isGroup, isRow, rowPoint, rowValue } from "./conditionShapes";

/** How many conditions a sentence spells out before it summarises the rest. */
const shown = 2;

function Chip({
  children,
  tone = "neutral",
  className,
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "target" | "broken";
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "rounded px-1.5 py-0.5 font-medium",
        tone === "neutral" && "bg-muted text-foreground",
        tone === "target" && "bg-destructive/10 font-semibold text-destructive",
        tone === "broken" &&
          "border border-dashed border-destructive/60 bg-destructive/10 font-semibold text-destructive",
        className,
      )}
    >
      {children}
    </span>
  );
}

const Word = ({ children }: { children: ReactNode }) => (
  <span className="text-muted-foreground">{children}</span>
);

/** A point as "<device> · <attribute>", without the raw ids the detail page keeps. */
export function PointChip({
  point,
  catalog,
}: {
  point: DevicePointRef;
  catalog: PointCatalog;
}) {
  const { t } = useTranslation("operatingRules");
  const attributeLabel = useAttributeLabel();
  const device = catalog.devices.find((d) => d.id === point.device_id);
  const attribute = pointAttribute(catalog, point);
  if (!device || !attribute)
    return (
      <Chip tone="broken" title={`${point.device_id}/${point.attribute}`}>
        {t("deletedPoint")}
      </Chip>
    );
  return (
    <Chip title={`${point.device_id}/${point.attribute}`}>
      {device.name} · {attributeLabel(point.attribute, attribute)}
    </Chip>
  );
}

/** A scalar as a reader sees it: on/off for booleans, a unit for known numbers. */
export function ValueChip({
  value,
  point,
  catalog,
  tone = "neutral",
}: {
  value: WriteExpression;
  point?: DevicePointRef;
  catalog: PointCatalog;
  tone?: "neutral" | "target";
}) {
  const { t } = useTranslation("operatingRules");
  if (!isScalar(value)) {
    if ("candidate" in value)
      return <Chip tone={tone}>{t("expression.candidate")}</Chip>;
    if ("device_id" in value)
      return <PointChip point={value} catalog={catalog} />;
    return <Chip tone={tone}>{t("computedValue")}</Chip>;
  }
  if (typeof value === "boolean")
    return <Chip tone={tone}>{t(value ? "on" : "off")}</Chip>;
  const unit = point
    ? attributeUnit(point.attribute, pointAttribute(catalog, point))
    : null;
  return (
    <Chip tone={tone}>
      {String(value)}
      {unit ? ` ${unit}` : ""}
    </Chip>
  );
}

function ConditionPhrase({
  value,
  catalog,
  depth = 0,
}: {
  value: WriteCondition;
  catalog: PointCatalog;
  depth?: number;
}) {
  const { t } = useTranslation("operatingRules");
  if (isGroup(value)) {
    const joiner = t(value.op === "all" ? "joinAnd" : "joinOr");
    if (!value.conditions.length)
      return <Word>{t(value.op === "all" ? "emptyAll" : "emptyAny")}</Word>;
    // Every level truncates: a nested group of ten must not spell itself out
    // while the top level claims to stop at two.
    const visible = value.conditions.slice(0, shown);
    const rest = value.conditions.length - visible.length;
    return (
      <>
        {depth > 0 && <Word>(</Word>}
        {visible.map((condition, index) => (
          <span key={index} className="contents">
            {index > 0 && <Word>{joiner}</Word>}
            <ConditionPhrase
              value={condition}
              catalog={catalog}
              depth={depth + 1}
            />
          </span>
        ))}
        {rest > 0 && (
          <>
            <Word>{joiner}</Word>
            <Chip>{t("moreConditions", { count: rest })}</Chip>
          </>
        )}
        {depth > 0 && <Word>)</Word>}
      </>
    );
  }
  if (!isRow(value)) return <Chip>{t("advancedCondition")}</Chip>;
  const point = rowPoint(value);
  const right = rowValue(value);
  return (
    <>
      <PointChip point={point} catalog={catalog} />
      <Word>{t(`comparison.${value.op}`)}</Word>
      {value.op === "in" ? (
        value.values.map((item, index) => (
          <span key={index} className="contents">
            {index > 0 && <Word>{t("joinOr")}</Word>}
            <ValueChip value={item} point={point} catalog={catalog} />
          </span>
        ))
      ) : right === undefined ? null : (
        <ValueChip value={right} point={point} catalog={catalog} />
      )}
    </>
  );
}

/**
 * A rule as a sentence: "Refuses <write> unless <conditions>". The same wording
 * the editor previews before saving, so what a reader sees in the list is what
 * the author signed off on.
 */
export function RuleSentence({
  rule,
  catalog,
  retired = false,
  className,
}: {
  rule: Pick<OperatingRuleDefinition, "target" | "condition">;
  catalog: PointCatalog;
  retired?: boolean;
  className?: string;
}) {
  const { t } = useTranslation("operatingRules");
  const attributeLabel = useAttributeLabel();
  const attribute = pointAttribute(catalog, rule.target);
  const unit = attributeUnit(rule.target.attribute, attribute);
  const value = rule.target.value;
  const targetValue =
    typeof value === "boolean"
      ? t(value ? "on" : "off")
      : `${value}${typeof value === "number" && unit ? ` ${unit}` : ""}`;
  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm leading-relaxed",
        className,
      )}
    >
      <Word>{t(retired ? "sentenceRefused" : "sentenceRefuses")}</Word>
      <Chip tone="target">
        {attribute
          ? attributeLabel(rule.target.attribute, attribute)
          : t("deletedPoint")}{" "}
        → {targetValue}
      </Chip>
      <Word>{t("sentenceUnless")}</Word>
      <ConditionPhrase value={rule.condition} catalog={catalog} />
    </p>
  );
}
