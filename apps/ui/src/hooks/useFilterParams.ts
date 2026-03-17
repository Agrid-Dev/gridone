import { useSearchParams } from "react-router";
import { useMemo } from "react";

const FILTER_KEYS = ["type"] as const;

export function useFilterParams(): Record<string, string> | undefined {
  const [searchParams] = useSearchParams();

  return useMemo(() => {
    const params: Record<string, string> = {};
    for (const key of FILTER_KEYS) {
      const value = searchParams.get(key);
      if (value) params[key] = value;
    }
    return Object.keys(params).length > 0 ? params : undefined;
  }, [searchParams]);
}
