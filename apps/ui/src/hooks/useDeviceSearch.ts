import { useMemo, useState } from "react";
import type { Device } from "@gridone/sdk";
import { searchDevices } from "@/lib/deviceSearch";

export function useDeviceSearch(devices: readonly Device[], initialQuery = "") {
  const [query, setQuery] = useState(initialQuery);
  const results = useMemo(
    () => searchDevices(devices, query),
    [devices, query],
  );
  return { query, setQuery, ...results };
}
