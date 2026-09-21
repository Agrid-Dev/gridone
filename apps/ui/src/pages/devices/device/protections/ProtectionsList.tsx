import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronRight, Info, Plus } from "lucide-react";
import type { ProtectionView } from "@gridone/sdk";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/contexts/AuthContext";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import {
  useProtectionDevices,
  useProtections,
  protectionsPath,
  protectionPath,
} from "./useProtections";
import { RuleSentence } from "./RuleSentence";
import type { PointCatalog } from "./expressions";

/**
 * A row's state, which drives both the dot and the wording: a rule whose points
 * no longer exist is not enforced, so it reads as a repair task rather than as
 * one more badge on an otherwise healthy rule.
 */
function status(view: ProtectionView) {
  if (view.protection.retirement) return "retired" as const;
  return view.reasons?.length ? ("broken" as const) : ("active" as const);
}

function ProtectionRow({
  view,
  catalog,
  last,
}: {
  view: ProtectionView;
  catalog: PointCatalog;
  last: boolean;
}) {
  const { t } = useTranslation("protections");
  const rule = view.protection;
  const state = status(view);
  return (
    <Link
      to={protectionPath(rule)}
      className={cn(
        "flex items-start gap-3.5 px-5 py-4 hover:bg-muted/40",
        !last && "border-b",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-2 h-2 w-2 shrink-0 rounded-full",
          state === "active" && "bg-success",
          state === "broken" && "bg-amber-600",
          state === "retired" && "bg-muted-foreground/40",
        )}
      />
      <div
        className={cn(
          "min-w-0 flex-1 space-y-2",
          state === "retired" && "opacity-60",
        )}
      >
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="font-semibold">{rule.name}</span>
          <span
            className={cn(
              "text-xs",
              state === "broken"
                ? "font-semibold text-amber-700"
                : "text-muted-foreground",
            )}
          >
            {t(
              state === "broken"
                ? "needsRepair"
                : state === "retired"
                  ? "retired"
                  : "active",
            )}
          </span>
        </div>
        <RuleSentence
          rule={rule}
          catalog={{ ...catalog, contracts: rule.points }}
          retired={state === "retired"}
        />
        {state === "broken" ? (
          <p className="flex items-center gap-2 text-sm text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {t("notEnforced")}
            <span className="font-semibold text-primary">{t("repair")}</span>
          </p>
        ) : (
          <p className="truncate text-sm text-muted-foreground">
            {rule.explanation}
          </p>
        )}
      </div>
      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export default function ProtectionsList() {
  const { t } = useTranslation("protections");
  const device = useDeviceFromRoute();
  const can = usePermissions();
  const { data: rows } = useProtections(device.id);
  const { data: devices } = useProtectionDevices();
  const createPath = `${protectionsPath(device.id)}/new`;
  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("title")}
        caption={t("intro", { device: device.name })}
        actions={
          can("protections:write") && (
            <Button asChild>
              <Link to={createPath}>
                <Plus className="h-4 w-4" />
                {t("create")}
              </Link>
            </Button>
          )
        }
      />
      {!rows.length ? (
        <ResourceEmpty
          resourceName={t("title")}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          showCreate={can("protections:write")}
          createTo={createPath}
          createLabel={t("create")}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          {rows.map((view, index) => (
            <ProtectionRow
              key={view.protection.id}
              view={view}
              catalog={{ devices }}
              last={index === rows.length - 1}
            />
          ))}
        </div>
      )}
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t("limits")}
      </p>
    </section>
  );
}
