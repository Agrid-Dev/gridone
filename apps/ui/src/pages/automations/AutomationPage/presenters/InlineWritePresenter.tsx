import { useTranslation } from "react-i18next";
import type { Action } from "@gridone/sdk";
import { formatValue } from "@/lib/formatValue";
import { AttributeName } from "@/pages/devices/device/operating-rules/OperatingRuleSummary";
import { useAutomationCatalog } from "../hooks/useAutomationCatalog";
import { inlineWriteOf } from "./commandShape";

/** View mode for the command action's inline shape: the target, then the
 *  static value it writes. */
export function InlineWritePresenter({ action }: { action: Action }) {
  const { t } = useTranslation("automations");
  const catalog = useAutomationCatalog();
  const write = inlineWriteOf(action);
  if (!write) return null;
  return (
    <div className="space-y-2 text-sm">
      {write.device_id ? (
        <AttributeName
          catalog={catalog}
          reference={{ device_id: write.device_id, attribute: write.attribute }}
        />
      ) : (
        <span>
          {t("write.eventDevice")} · {write.attribute}
        </span>
      )}
      <p>← {formatValue(write.value)}</p>
    </div>
  );
}
