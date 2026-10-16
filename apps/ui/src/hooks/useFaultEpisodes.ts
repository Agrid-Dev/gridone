import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type {
  FaultEpisode,
  FaultEpisodeListParams,
  FaultEpisodes,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

const NO_EPISODES: FaultEpisode[] = [];

/**
 * Alert episodes over a period, rebuilt by the API from the devices' recorded
 * history. Read on demand rather than polled: the past does not change, and
 * an alert still on is followed live by the ongoing list. Keyed under
 * `faults`, so whatever refreshes the alerts refreshes their history too.
 */
export function useFaultEpisodes(
  params: FaultEpisodeListParams,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const { t } = useTranslation("faults");
  const client = useGridoneClient();

  const {
    data,
    isLoading,
    error: queryError,
  } = useQuery<FaultEpisodes>({
    queryKey: ["faults", "episodes", params],
    queryFn: () => client.devices.listFaultEpisodes(params),
    staleTime: 60_000,
    enabled,
  });

  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : t("faults.history.unableToLoad")
    : null;

  return {
    episodes: data?.episodes ?? NO_EPISODES,
    /** The period the API read, `last` resolved; null until it answers. */
    period: data
      ? { start: Date.parse(data.start), end: Date.parse(data.end) }
      : null,
    truncated: data?.truncated ?? false,
    loading: isLoading,
    error,
  };
}
