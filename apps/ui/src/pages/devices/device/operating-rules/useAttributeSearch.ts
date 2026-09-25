import { useMemo, useState } from "react";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { foldText } from "@/lib/textFormat";
import type { AttributeCatalog } from "./expressions";

const ATTRIBUTE_SEARCH_LIMIT = 40;

export function useAttributeSearch(
  catalog: AttributeCatalog,
  writable: boolean,
) {
  const attributeLabel = useAttributeLabel();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const attributes = useMemo(
    () =>
      catalog.devices.flatMap((device) =>
        Object.entries(device.attributes ?? {})
          .filter(
            ([, attribute]) =>
              !writable ||
              (Array.isArray(attribute.read_write_modes) &&
                attribute.read_write_modes.includes("write")),
          )
          .map(([attribute, metadata]) => {
            const label = `${device.name} · ${attributeLabel(attribute, metadata)}`;
            return {
              reference: { device_id: device.id, attribute },
              key: JSON.stringify([device.id, attribute]),
              label,
              search: foldText(`${label} ${device.id} ${attribute}`),
            };
          }),
      ),
    [catalog.devices, writable, attributeLabel],
  );
  const matches = useMemo(() => {
    const tokens = foldText(query).trim().split(/\s+/).filter(Boolean);
    return attributes.filter((reference) =>
      tokens.every((token) => reference.search.includes(token)),
    );
  }, [attributes, query]);
  return {
    open,
    setOpen: (next: boolean) => {
      setOpen(next);
      if (!next) setQuery("");
    },
    query,
    setQuery,
    attributes: matches.slice(0, ATTRIBUTE_SEARCH_LIMIT),
    overflow: Math.max(0, matches.length - ATTRIBUTE_SEARCH_LIMIT),
  };
}
