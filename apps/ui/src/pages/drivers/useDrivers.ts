import {
  useQuery,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { isGridoneError, type Driver, type DriverYaml } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { useTranslation } from "react-i18next";
import type { DevicesFilter } from "@/lib/devices";

// Matches the raw value of a top-level `id:` field in the driver YAML, e.g.
// "id: my_driver" or "id: 'my_driver'" -> captures `my_driver` (unquoted) or
// `"my_driver"` / `'my_driver'` (quoted, quotes stripped separately below).
const DRIVER_ID_LINE = /^id:[ \t]*(.+?)[ \t]*$/m;

// Matches a fully-quoted scalar, e.g. `"my_driver"` or `'my_driver'`.
const QUOTED_SCALAR = /^(["'])((?:(?!\1).)*)\1$/;

export function extractDriverId(yaml: string): string {
  const line = yaml.match(DRIVER_ID_LINE);
  if (!line) {
    throw new Error("Driver YAML must include a top-level 'id' field");
  }
  const rawValue = line[1];
  const quoted = rawValue.match(QUOTED_SCALAR);
  // Unquoted YAML comments start at whitespace followed by "#"; a quoted
  // scalar's content (including any "#") is never treated as a comment.
  const id = quoted ? quoted[2] : rawValue.split(/[ \t]+#/)[0].trim();
  if (!id) {
    throw new Error("Driver YAML must include a top-level 'id' field");
  }
  return id;
}

// Driver listing only filters by `types`; other DevicesFilter dimensions
// (ids, asset_id, is_faulty) are accepted from the shared filter UI but
// ignored by the backend.
export const useDrivers = (filters?: DevicesFilter) => {
  const { t } = useTranslation(["drivers", "common"]);
  const navigate = useNavigate();
  const client = useGridoneClient();
  const driversListQuery = useQuery<Driver[]>({
    queryKey: ["drivers", filters],
    queryFn: () =>
      client.drivers.list(
        filters?.types?.length ? { type: filters.types[0] } : undefined,
      ),
    initialData: [],
  });
  const handleApiError = (err: Error) => {
    const detail = isGridoneError(err) ? err.detail : err.message;
    const errorMessage = `${t("common:errors.default")}: ${detail}`;
    toast.error(errorMessage);
  };
  const createMutation = useMutation({
    mutationFn: (payload: DriverYaml) =>
      client.drivers.create(extractDriverId(payload.yaml), payload),
    onSuccess: async (result: Driver) => {
      await driversListQuery.refetch();
      navigate(`../${result.id}`);
      toast.success(t("feedback.created", { driverId: result.id }));
    },
    onError: handleApiError,
  });
  const handleCreate = async (payload: DriverYaml) =>
    createMutation.mutateAsync(payload);
  return { driversListQuery, createMutation, handleCreate };
};

/**
 * Fetches the driver named by the `:driverId` route param. Suspends while
 * loading and propagates an unknown driver as `GridoneError(404)` from the
 * backend (→ not-found fallback). The returned driver is therefore always
 * defined. A missing `:driverId` is a route-config bug, not a 404, so it
 * raises a plain error (→ generic error fallback).
 *
 * The query is seeded from any cached drivers list (the list view fetches them
 * all), so navigating from the list renders instantly; a direct page load has
 * no cache and hits the API.
 */
export const useDriverFromRoute = (): Driver => {
  const { driverId } = useParams<{ driverId: string }>();
  const queryClient = useQueryClient();
  const client = useGridoneClient();
  if (!driverId) {
    throw new Error("useDriverFromRoute requires a 'driverId' route param");
  }
  // Look up the driver in any cached `["drivers", filters]` list.
  const cachedFromList = ():
    | { driver: Driver; updatedAt: number }
    | undefined => {
    for (const [key, drivers] of queryClient.getQueriesData<Driver[]>({
      queryKey: ["drivers"],
    })) {
      const driver = drivers?.find((d) => d.id === driverId);
      if (driver) {
        return {
          driver,
          updatedAt: queryClient.getQueryState(key)?.dataUpdatedAt ?? 0,
        };
      }
    }
    return undefined;
  };
  const { data } = useSuspenseQuery<Driver>({
    queryKey: ["driver", driverId],
    queryFn: () => client.drivers.get(driverId),
    initialData: () => cachedFromList()?.driver,
    initialDataUpdatedAt: () => cachedFromList()?.updatedAt,
  });
  return data;
};

export const useDeleteDriver = () => {
  const { t } = useTranslation(["drivers", "common"]);
  const navigate = useNavigate();
  const client = useGridoneClient();
  const deleteMutation = useMutation({
    mutationFn: (driverId: string) => client.drivers.delete(driverId),
    onSuccess: () => {
      toast.success(t("feedback.deleted"));
      navigate("..");
    },
    onError: (err: Error) => {
      const detail = isGridoneError(err) ? err.detail : err.message;
      toast.error(`${t("common:errors.default")}: ${detail}`);
    },
  });
  const handleDelete = async (driverId: string) =>
    deleteMutation.mutateAsync(driverId);
  return { handleDelete };
};
