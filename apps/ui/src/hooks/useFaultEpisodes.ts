import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type {
  FaultEpisode,
  FaultEpisodeListParams,
  FaultEpisodes,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

const NO_EPISODES: FaultEpisode[] = [];

/** History and recurrence share a clock and refresh only while visible. */
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
    refetchInterval: (query) =>
      !params.end ||
      query.state.data?.truncated ||
      query.state.data?.episodes.some((episode) => episode.ended_at == null)
        ? 60_000
        : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
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
    asOf: data ? Date.parse(data.as_of) : null,
    truncated: data?.truncated ?? false,
    loading: isLoading,
    error,
  };
}
