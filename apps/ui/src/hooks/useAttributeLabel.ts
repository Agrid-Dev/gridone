import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toLabel } from "@/lib/textFormat";

/**
 * Display label for a device attribute name: the `devices:attributes.*`
 * translation when the name is a known standard attribute, otherwise the
 * prettified snake_case fallback ("fan_speed" → "Fan Speed").
 */
export function useAttributeLabel(): (name: string) => string {
  const { t } = useTranslation("devices");
  return useCallback(
    // The catalog is open-ended (driver-defined attributes), so the key is
    // cast to a representative literal for the typed resources.
    (name: string) =>
      t(`attributes.${name}` as "attributes.temperature", {
        defaultValue: toLabel(name),
      }),
    [t],
  );
}
