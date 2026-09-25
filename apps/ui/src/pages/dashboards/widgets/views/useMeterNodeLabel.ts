import { useTranslation } from "react-i18next";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import type { MeterTreeDatum } from "./meterTree";

/**
 * What a meter tree node is called: its own label when it has one, else its
 * attribute's; the residual is always "unmetered".
 */
export function useMeterNodeLabel(): (datum: MeterTreeDatum) => string {
  const { t } = useTranslation("dashboards");
  const attributeLabel = useAttributeLabel();
  return (datum) =>
    datum.kind === "residual"
      ? t("widgets.meterTree.unmetered")
      : (datum.label ??
        attributeLabel(datum.attribute ?? "", { label: datum.attributeLabel }));
}
