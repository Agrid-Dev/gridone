import { useCallback, useEffect, useMemo, useState, type FC } from "react";
import { useNavigate, useParams } from "react-router";
import type { Synoptic } from "@gridone/sdk";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { usePermissions } from "@/contexts/AuthContext";
import { useSynopticValues } from "@/hooks/useSynopticValues";
import { useFaultsPage } from "@/pages/faults/useFaultsPage";
import {
  readDefaultSynoptic,
  writeDefaultSynoptic,
  writeLastSynoptic,
} from "@/lib/synopticPreference";
import { SynopticPage } from "./SynopticPage";
import { useSynopticPage, useSynoptics } from "./useSynoptics";

/** The devices the plate's symbols are: what a click opens and what the
 *  fault list is scoped to. What a symbol reads is not what it is. */
const symbolDeviceIds = (doc: Synoptic): string[] => [
  ...new Set(
    (doc.symbols ?? []).flatMap((s) => (s.device_id ? [s.device_id] : [])),
  ),
];

/** The route's side of the page: the plate, the others, its live values
 *  and faults, the pin; `SynopticPage` lays them out. */
const SynopticDetailContent: FC = () => {
  const navigate = useNavigate();
  const can = usePermissions();
  const { doc, knownSynoptics } = useSynopticPage();
  const synoptics = useSynoptics();
  const [pinned, setPinned] = useState(readDefaultSynoptic);
  const values = useSynopticValues(doc);
  const deviceIds = useMemo(() => symbolDeviceIds(doc), [doc]);
  const faults = useFaultsPage(deviceIds);

  // What `/synoptics` reopens when nothing is pinned.
  useEffect(() => writeLastSynoptic(doc.id), [doc.id]);

  const onNavigate = useCallback(
    (target: string) => navigate(`/synoptics/${encodeURIComponent(target)}`),
    [navigate],
  );
  const onPin = useCallback((id: string | null) => {
    writeDefaultSynoptic(id);
    setPinned(id);
  }, []);

  return (
    <SynopticPage
      doc={doc}
      values={values}
      knownSynoptics={knownSynoptics}
      synoptics={synoptics}
      pinned={pinned}
      onPin={onPin}
      onNavigate={onNavigate}
      faults={faults}
      canWrite={can("synoptics:write")}
    />
  );
};

/** Keyed on the plate: a link to another plate lands with no popover
 *  open, since the device it showed belongs to the plate left behind. */
const SynopticDetail: FC = () => {
  const { synopticId } = useParams<{ synopticId: string }>();
  return (
    <ResourceBoundary resetKeys={[synopticId]}>
      <SynopticDetailContent key={synopticId} />
    </ResourceBoundary>
  );
};

export default SynopticDetail;
