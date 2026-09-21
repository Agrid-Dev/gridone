import { useMemo, useState } from "react";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import type { PointCatalog } from "./expressions";

const POINT_SEARCH_LIMIT = 40;

/** Fold accents so, for example, "arret" also matches "Arrêt". */
function searchable(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function usePointSearch(catalog: PointCatalog, writable: boolean) {
  const attributeLabel = useAttributeLabel();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const points = useMemo(
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
              point: { device_id: device.id, attribute },
              key: JSON.stringify([device.id, attribute]),
              label,
              search: searchable(`${label} ${device.id} ${attribute}`),
            };
          }),
      ),
    [catalog.devices, writable, attributeLabel],
  );
  const matches = useMemo(() => {
    const tokens = searchable(query).trim().split(/\s+/).filter(Boolean);
    return points.filter((point) =>
      tokens.every((token) => point.search.includes(token)),
    );
  }, [points, query]);
  return {
    open,
    setOpen: (next: boolean) => {
      setOpen(next);
      if (!next) setQuery("");
    },
    query,
    setQuery,
    points: matches.slice(0, POINT_SEARCH_LIMIT),
    overflow: Math.max(0, matches.length - POINT_SEARCH_LIMIT),
  };
}
