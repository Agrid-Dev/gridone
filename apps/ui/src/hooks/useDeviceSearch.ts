import { useMemo, useState } from "react";
import type { Device } from "@gridone/sdk";
import { searchDevices } from "@/lib/deviceSearch";

export function useDeviceSearch(devices: readonly Device[]) {
  const [query, setQuery] = useState("");
  const results = useMemo(
    () => searchDevices(devices, query),
    [devices, query],
  );
  return { query, setQuery, ...results };
}
