import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  useDriverLabelsLookup,
  type DriverRef,
} from "@/contexts/DriverLabelsContext";
import { localize } from "@/lib/localizedText";

/**
 * The help text a driver declares for one of a device's attributes, in the
 * current language; undefined when it declares none.
 */
export function useAttributeDescription(): (
  name: string,
  device: DriverRef,
) => string | undefined {
  const { i18n } = useTranslation("devices");
  const labelsOf = useDriverLabelsLookup();
  return useCallback(
    (name: string, device: DriverRef) => {
      const description = labelsOf(device)?.attributes?.[name]?.description;
      return description ? localize(description, i18n.language) : undefined;
    },
    [i18n.language, labelsOf],
  );
}
