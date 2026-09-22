import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronRight, Info, Plus } from "lucide-react";
import type { OperatingRuleView } from "@gridone/sdk";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/contexts/AuthContext";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import {
  isOperatingRuleEnabled,
  useOperatingRuleDevices,
  useOperatingRules,
  operatingRulesPath,
  operatingRulePath,
} from "./useOperatingRules";
import { RuleSentence } from "./RuleSentence";
import type { AttributeCatalog } from "./expressions";

/** Disabled rules stay visible; active rules with broken references need repair. */
function status(view: OperatingRuleView) {
  if (view.operating_rule.retirement) return "retired" as const;
  if (!isOperatingRuleEnabled(view.operating_rule)) return "disabled" as const;
  return view.reasons?.length ? ("broken" as const) : ("active" as const);
}

function OperatingRuleRow({
  view,
  catalog,
  last,
}: {
  view: OperatingRuleView;
  catalog: AttributeCatalog;
  last: boolean;
}) {
  const { t } = useTranslation("operatingRules");
  const rule = view.operating_rule;
  const state = status(view);
  const inactive = !isOperatingRuleEnabled(rule);
  return (
    <Link
      to={operatingRulePath(rule)}
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
          inactive && "bg-muted-foreground/40",
        )}
      />
      <div className={cn("min-w-0 flex-1 space-y-2", inactive && "opacity-60")}>
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
            {t(state === "broken" ? "needsRepair" : state)}
          </span>
        </div>
        <RuleSentence
          rule={rule}
          catalog={{ ...catalog, contracts: rule.attributes }}
          retired={inactive}
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

export default function OperatingRulesList() {
  const { t } = useTranslation("operatingRules");
  const device = useDeviceFromRoute();
  const can = usePermissions();
  const { data: rows } = useOperatingRules(device.id);
  const { data: devices } = useOperatingRuleDevices();
  const createPath = `${operatingRulesPath(device.id)}/new`;
  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("title")}
        caption={t("intro", { device: device.name })}
        actions={
          can("operating_rules:write") && (
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
          showCreate={can("operating_rules:write")}
          createTo={createPath}
          createLabel={t("create")}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          {rows.map((view, index) => (
            <OperatingRuleRow
              key={view.operating_rule.id}
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
