import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  attributeValueText,
  type AttributeValueTextOptions,
} from "@/lib/attributeValueLabel";
import type { CellValue } from "@/lib/formatValue";

/** {@link attributeValueText} bound to the current language. */
export function useValueText(): (
  attributeName: string,
  value: CellValue,
  options?: Omit<AttributeValueTextOptions, "language">,
) => string {
  const { t, i18n } = useTranslation("common");
  return useCallback(
    (
      attributeName: string,
      value: CellValue,
      options?: Omit<AttributeValueTextOptions, "language">,
    ) =>
      attributeValueText(attributeName, value, t, {
        ...options,
        language: i18n.language,
      }),
    [t, i18n.language],
  );
}
