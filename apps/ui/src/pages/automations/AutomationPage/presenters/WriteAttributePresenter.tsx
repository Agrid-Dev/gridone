import { useTranslation } from "react-i18next";
import type { Action, WriteExpression } from "@gridone/sdk";
import {
  AttributeName,
  ExpressionSummary,
} from "@/pages/devices/device/operating-rules/OperatingRuleSummary";
import { useAutomationCatalog } from "../hooks/useAutomationCatalog";

export function WriteAttributePresenter({ action }: { action: Action }) {
  const { t } = useTranslation("automations");
  const catalog = useAutomationCatalog();
  const { device_id: deviceId, attribute, value } = action.params ?? {};
  return (
    <div className="space-y-2 text-sm">
      {typeof deviceId === "string" ? (
        <AttributeName
          catalog={catalog}
          reference={{ device_id: deviceId, attribute: String(attribute) }}
        />
      ) : (
        <span>
          {t("write.eventDevice")} · {String(attribute)}
        </span>
      )}
      <p>
        ←{" "}
        <ExpressionSummary value={value as WriteExpression} catalog={catalog} />
      </p>
    </div>
  );
}
