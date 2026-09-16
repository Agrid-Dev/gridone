import { useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import type { Synoptic, SynopticSummary } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

export const SYNOPTICS_KEY = ["synoptics"] as const;

export const synopticKey = (id: string) => ["synoptic", id] as const;

/** Every plate's envelope: the index. Suspends until loaded, for pages
 *  under a `ResourceBoundary`. */
export function useSynoptics(): SynopticSummary[] {
  const client = useGridoneClient();
  const { data } = useSuspenseQuery({
    queryKey: SYNOPTICS_KEY,
    queryFn: () => client.synoptics.list(),
    select: (page) => page.items,
  });
  return data;
}

/** The plate named by the `:synopticId` route param, and the ids of every
 *  plate a link may point to, fetched together so a cold deep link costs
 *  one round trip. An unknown id propagates as a 404 from the backend
 *  (not-found fallback); a missing param is a route-config bug and raises
 *  a plain error. */
export function useSynopticPage(): {
  doc: Synoptic;
  knownSynoptics: ReadonlySet<string>;
} {
  const { synopticId } = useParams<{ synopticId: string }>();
  const client = useGridoneClient();
  if (!synopticId) {
    throw new Error("useSynopticPage requires a 'synopticId' route param");
  }
  const [doc, knownSynoptics] = useSuspenseQueries({
    queries: [
      {
        queryKey: synopticKey(synopticId),
        queryFn: () => client.synoptics.get(synopticId),
      },
      {
        queryKey: SYNOPTICS_KEY,
        queryFn: () => client.synoptics.list(),
        select: (page: { items: SynopticSummary[] }) =>
          new Set(page.items.map((s) => s.id)),
      },
    ],
  });
  return { doc: doc.data, knownSynoptics: knownSynoptics.data };
}
