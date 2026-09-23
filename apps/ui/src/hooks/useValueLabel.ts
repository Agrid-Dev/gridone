import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { ValueLabel } from "@gridone/sdk";
import { valueLabelText } from "@/lib/attributeValueLabel";

/** {@link valueLabelText} bound to the current language. */
export function useValueLabel(): (
  value: boolean,
  valueLabels?: ValueLabel[] | null,
) => string {
  const { t, i18n } = useTranslation("common");
  return useCallback(
    (value: boolean, valueLabels?: ValueLabel[] | null) =>
      valueLabelText(value, t, valueLabels, i18n.language),
    [t, i18n.language],
  );
}
