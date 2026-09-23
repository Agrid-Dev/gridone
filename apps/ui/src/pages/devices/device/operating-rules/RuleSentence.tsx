import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  DeviceAttributeRef,
  OperatingRuleDefinition,
  WriteCondition,
  WriteExpression,
} from "@gridone/sdk";
import { cn } from "@/lib/utils";
import { attributeUnit } from "@/lib/attributeUnits";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import {
  isScalar,
  catalogAttribute,
  type AttributeCatalog,
} from "./expressions";
import { isGroup, isRow, rowAttribute, rowValue } from "./conditionShapes";

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

/** An automation event value (`{event: "value"}`), which only automations read. */
function isEventValue(
  value: WriteExpression,
): value is Extract<WriteExpression, { event: string }> {
  return typeof value === "object" && value !== null && "event" in value;
}

/** A reference as "<device> · <attribute>", without the raw ids the detail page keeps. */
export function AttributeChip({
  reference,
  catalog,
}: {
  reference: DeviceAttributeRef;
  catalog: AttributeCatalog;
}) {
  const { t } = useTranslation("operatingRules");
  const attributeLabel = useAttributeLabel();
  const device = catalog.devices.find((d) => d.id === reference.device_id);
  const attribute = catalogAttribute(catalog, reference);
  if (!device || !attribute)
    return (
      <Chip
        tone="broken"
        title={`${reference.device_id}/${reference.attribute}`}
      >
        {t("deletedAttribute")}
      </Chip>
    );
  return (
    <Chip title={`${reference.device_id}/${reference.attribute}`}>
      {device.name} · {attributeLabel(reference.attribute, attribute)}
    </Chip>
  );
}

/** A scalar as a reader sees it: on/off for booleans, a unit for known numbers. */
export function ValueChip({
  value,
  reference,
  catalog,
  tone = "neutral",
}: {
  value: WriteExpression;
  reference?: DeviceAttributeRef;
  catalog: AttributeCatalog;
  tone?: "neutral" | "target";
}) {
  const { t } = useTranslation("operatingRules");
  if (!isScalar(value)) {
    if ("candidate" in value)
      return <Chip tone={tone}>{t("expression.candidate")}</Chip>;
    if ("device_id" in value)
      return <AttributeChip reference={value} catalog={catalog} />;
    return <Chip tone={tone}>{t("computedValue")}</Chip>;
  }
  if (typeof value === "boolean")
    return <Chip tone={tone}>{t(value ? "on" : "off")}</Chip>;
  const unit = reference
    ? attributeUnit(reference.attribute, catalogAttribute(catalog, reference))
    : null;
  return (
    <Chip tone={tone}>
      {String(value)}
      {unit ? ` ${unit}` : ""}
    </Chip>
  );
}

export function ConditionPhrase({
  value,
  catalog,
  depth = 0,
}: {
  value: WriteCondition;
  catalog: AttributeCatalog;
  depth?: number;
}) {
  const { t } = useTranslation(["operatingRules", "automations"]);
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
  if (value.op === "not") {
    const inner = value.condition;
    if (isRow(inner) && inner.op === "is_known")
      return (
        <>
          <AttributeChip reference={rowAttribute(inner)} catalog={catalog} />
          <Word>{t("comparison.not_known")}</Word>
        </>
      );
    return (
      <>
        <Word>{t("negation")} (</Word>
        <ConditionPhrase value={inner} catalog={catalog} depth={depth + 1} />
        <Word>)</Word>
      </>
    );
  }
  if ("left" in value && isEventValue(value.left) && isScalar(value.right))
    return (
      <>
        <Chip>{t(`automations:event.${value.left.event}`)}</Chip>
        <Word>{t(`comparison.${value.op}`)}</Word>
        <ValueChip value={value.right} catalog={catalog} />
      </>
    );
  if (!isRow(value)) return <Chip>{t("advancedCondition")}</Chip>;
  const reference = rowAttribute(value);
  const right = rowValue(value);
  return (
    <>
      <AttributeChip reference={reference} catalog={catalog} />
      <Word>{t(`comparison.${value.op}`)}</Word>
      {value.op === "in" ? (
        value.values.map((item, index) => (
          <span key={index} className="contents">
            {index > 0 && <Word>{t("joinOr")}</Word>}
            <ValueChip value={item} reference={reference} catalog={catalog} />
          </span>
        ))
      ) : right === undefined ? null : (
        <ValueChip value={right} reference={reference} catalog={catalog} />
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
  catalog: AttributeCatalog;
  retired?: boolean;
  className?: string;
}) {
  const { t } = useTranslation("operatingRules");
  const attributeLabel = useAttributeLabel();
  const attribute = catalogAttribute(catalog, rule.target);
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
          : t("deletedAttribute")}{" "}
        → {targetValue}
      </Chip>
      <Word>{t("sentenceUnless")}</Word>
      <ConditionPhrase value={rule.condition} catalog={catalog} />
    </p>
  );
}
