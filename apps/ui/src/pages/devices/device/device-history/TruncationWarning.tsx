import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { useDeviceHistoryContext } from "./DeviceHistoryContext";

/** Names the selected attributes the API cut short over the window. Sits in
 *  the layout, so the chart and the table both carry it: a truncated series
 *  reads incomplete in either view. */
export function TruncationWarning() {
  const { t } = useTranslation("devices");
  const { truncatedAttributes, attributes } = useDeviceHistoryContext();
  const labelFor = useAttributeLabel();
  if (truncatedAttributes.length === 0) return null;
  return (
    <p
      role="status"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-status-warning"
    >
      <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
      {t("history.truncatedWarning", {
        attributes: truncatedAttributes
          .map((name) => labelFor(name, attributes[name]))
          .join(", "),
      })}
    </p>
  );
}
