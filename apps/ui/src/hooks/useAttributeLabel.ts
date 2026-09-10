import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { localize, type LocalizedText } from "@/lib/localizedText";
import { toLabel } from "@/lib/textFormat";

/**
 * Display label for a device attribute: the label its driver declares
 * (resolved in the current language) when there is one, else the
 * `devices:attributes.*` translation when the name is a known standard
 * attribute, else the prettified snake_case fallback ("fan_speed" → "Fan
 * Speed").
 */
export function useAttributeLabel(): (
  name: string,
  attribute?: { label?: LocalizedText | null } | null,
) => string {
  const { t, i18n } = useTranslation("devices");
  return useCallback(
    (name: string, attribute?: { label?: LocalizedText | null } | null) => {
      if (attribute?.label) return localize(attribute.label, i18n.language);
      // The catalog is open-ended (driver-defined attributes), so the key is
      // cast to a representative literal for the typed resources.
      return t(`attributes.${name}` as "attributes.temperature", {
        defaultValue: toLabel(name),
      });
    },
    [t, i18n.language],
  );
}
