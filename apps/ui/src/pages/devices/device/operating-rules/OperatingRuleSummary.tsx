import { createContext, useContext, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  DeviceAttributeRef,
  OperatingRuleDefinition,
  WriteCondition,
  WriteExpression,
} from "@gridone/sdk";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { catalogAttribute, type AttributeCatalog } from "./expressions";

/**
 * Whether a reference prints its raw `device_id/attribute`. The detail page and the
 * revision history keep them — they are what an operator quotes when repairing
 * a reference — while the editor names attributes the way the rest of the app does.
 */
const AttributeIds = createContext(true);

export const WithoutAttributeIds = ({ children }: { children: ReactNode }) => (
  <AttributeIds.Provider value={false}>{children}</AttributeIds.Provider>
);

export function AttributeName({
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
  const withIds = useContext(AttributeIds);
  return (
    <span className={!device || !attribute ? "text-destructive" : undefined}>
      {device?.name ?? t("missing", { id: reference.device_id })} /{" "}
      {attribute
        ? attributeLabel(reference.attribute, attribute)
        : t("missing", { id: reference.attribute })}
      {withIds && (
        <span className="ml-1 text-xs text-muted-foreground">
          ({reference.device_id}/{reference.attribute})
        </span>
      )}
    </span>
  );
}

function ExpressionSummary({
  value,
  catalog,
}: {
  value: WriteExpression;
  catalog: AttributeCatalog;
}) {
  const { t } = useTranslation("operatingRules");
  if (typeof value !== "object")
    return (
      <span className="font-mono">
        {typeof value === "boolean"
          ? t(value ? "true" : "false")
          : JSON.stringify(value)}
      </span>
    );
  if ("device_id" in value)
    return <AttributeName reference={value} catalog={catalog} />;
  if ("candidate" in value) return <span>{t("expression.candidate")}</span>;
  if ("args" in value)
    return (
      <span>
        {t(`expression.${value.op}`)} (
        {value.args.map((arg, i) => (
          <span key={i}>
            {i > 0 && ", "}
            <ExpressionSummary value={arg} catalog={catalog} />
          </span>
        ))}
        )
      </span>
    );
  if ("then" in value)
    return (
      <span>
        {t("expression.if")} (
        <ConditionSummary value={value.condition} catalog={catalog} />
        ), {t("then")}{" "}
        <ExpressionSummary value={value.then} catalog={catalog} />,{" "}
        {t("otherwise")}{" "}
        <ExpressionSummary value={value.otherwise} catalog={catalog} />
      </span>
    );
  return (
    <span>
      {t("implicitAttribute")}: {value.attribute}
    </span>
  );
}

export function ConditionSummary({
  value,
  catalog,
}: {
  value: WriteCondition;
  catalog: AttributeCatalog;
}) {
  const { t } = useTranslation("operatingRules");
  if ("left" in value)
    return (
      <span>
        <ExpressionSummary value={value.left} catalog={catalog} />{" "}
        {t(`operatorLabel.${value.op}`)}{" "}
        <ExpressionSummary value={value.right} catalog={catalog} />
      </span>
    );
  if ("conditions" in value)
    return (
      <span>
        {t(`operatorLabel.${value.op}`)}:{" "}
        {value.conditions.length
          ? value.conditions.map((c, i) => (
              <span key={i}>
                {i > 0 && "; "}(<ConditionSummary value={c} catalog={catalog} />
                )
              </span>
            ))
          : t(value.op === "all" ? "emptyAll" : "emptyAny")}
      </span>
    );
  if ("condition" in value)
    return (
      <span>
        {t("operatorLabel.not")} (
        <ConditionSummary value={value.condition} catalog={catalog} />)
      </span>
    );
  return (
    <span>
      <ExpressionSummary value={value.value} catalog={catalog} />{" "}
      {t(`operatorLabel.${value.op}`)}{" "}
      {"values" in value &&
        value.values.map((v, i) => (
          <span key={i}>
            {i > 0 && ", "}
            <ExpressionSummary value={v} catalog={catalog} />
          </span>
        ))}
    </span>
  );
}

export function OperatingRuleSummary({
  rule,
  catalog,
}: {
  rule: OperatingRuleDefinition;
  catalog: AttributeCatalog;
}) {
  const { t } = useTranslation("operatingRules");
  return (
    <dl className="space-y-4 text-sm break-words">
      <div>
        <dt className="mb-1 font-medium">{t("target")}</dt>
        <dd>
          <AttributeName reference={rule.target} catalog={catalog} /> →{" "}
          <ExpressionSummary value={rule.target.value} catalog={catalog} />
        </dd>
      </div>
      <div>
        <dt className="mb-1 font-medium">{t("allowWhen")}</dt>
        <dd>
          <ConditionSummary value={rule.condition} catalog={catalog} />
        </dd>
      </div>
      <div>
        <dt className="mb-1 font-medium">{t("freshnessCheck")}</dt>
        <dd>
          {rule.max_age_seconds == null
            ? t("freshnessDisabled")
            : t("freshnessDuration", { seconds: rule.max_age_seconds })}
        </dd>
      </div>
      <div>
        <dt className="mb-1 font-medium">{t("explanation")}</dt>
        <dd className="whitespace-pre-wrap">{rule.explanation}</dd>
      </div>
    </dl>
  );
}
