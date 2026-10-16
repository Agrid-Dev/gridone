import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  useDriverLabelsLookup,
  type DriverRef,
} from "@/contexts/DriverLabelsContext";
import { localize, type LocalizedText } from "@/lib/localizedText";
import { toLabel } from "@/lib/textFormat";

/**
 * Where an attribute's declared label comes from: the device it belongs to
 * (its driver's labels document is looked up), or a row the server already
 * labelled for a set of devices (an attribute coverage, a fault, a preview).
 */
export type AttributeLabelSource =
  | DriverRef
  | { label?: LocalizedText | null }
  | null
  | undefined;

function declaredLabel(
  name: string,
  source: AttributeLabelSource,
  labelsOf: (
    ref: DriverRef,
  ) =>
    | { attributes?: Record<string, { label?: LocalizedText | null }> }
    | undefined,
): LocalizedText | null | undefined {
  if (!source) return undefined;
  if ("driver_id" in source) return labelsOf(source)?.attributes?.[name]?.label;
  return source.label;
}

/**
 * Display label for a device attribute: the label its driver declares
 * (resolved in the current language) when there is one, else the
 * `devices:attributes.*` translation when the name is a known standard
 * attribute, else the prettified snake_case fallback ("fan_speed" → "Fan
 * Speed").
 */
export function useAttributeLabel(): (
  name: string,
  source?: AttributeLabelSource,
) => string {
  const { t, i18n } = useTranslation("devices");
  const labelsOf = useDriverLabelsLookup();
  return useCallback(
    (name: string, source?: AttributeLabelSource) => {
      const declared = declaredLabel(name, source, labelsOf);
      if (declared) return localize(declared, i18n.language);
      // The catalog is open-ended (driver-defined attributes), so the key is
      // cast to a representative literal for the typed resources.
      return t(`attributes.${name}` as "attributes.temperature", {
        defaultValue: toLabel(name),
      });
    },
    [t, i18n.language, labelsOf],
  );
}
