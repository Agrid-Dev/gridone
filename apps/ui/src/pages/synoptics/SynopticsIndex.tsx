import type { FC } from "react";
import { Navigate } from "react-router";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { useTranslation } from "react-i18next";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/contexts/AuthContext";
import {
  landingSynopticId,
  readDefaultSynoptic,
  readLastSynoptic,
} from "@/lib/synopticPreference";
import { useSynoptics } from "./useSynoptics";

/** `/synoptics` is not a page of its own once a plate exists: it opens one
 *  (the pinned plate, else the last seen, else the first) and the plate's
 *  title switches to the others. Only an empty site stays here, with the
 *  editor offered to those who may write. */
const SynopticsIndexContent: FC = () => {
  const { t } = useTranslation("synoptics");
  const can = usePermissions();
  const synoptics = useSynoptics();
  const target = landingSynopticId(
    synoptics.map((s) => s.id),
    { pinned: readDefaultSynoptic(), last: readLastSynoptic() },
  );

  if (target) {
    return <Navigate replace to={`/synoptics/${encodeURIComponent(target)}`} />;
  }

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("title")}
        caption={t("caption")}
        actions={
          can("synoptics:write") && (
            <Button asChild>
              <Link to="/synoptics/new">{t("editor.new")}</Link>
            </Button>
          )
        }
      />
      <ResourceEmpty
        resourceName={t("resourceName")}
        showCreate={false}
        title={t("emptyTitle")}
        description={t("emptyDescription")}
      />
    </section>
  );
};

const SynopticsIndex: FC = () => (
  <ResourceBoundary resetKeys={[]}>
    <SynopticsIndexContent />
  </ResourceBoundary>
);

export default SynopticsIndex;
