import { useTranslation } from "react-i18next";
import { ResourceLink } from "@/components/ResourceLink";
import { useAutomationDiagnostics } from "../hooks/useAutomationDiagnostics";

export function AutomationDiagnostics({ id }: { id: string }) {
  const { t } = useTranslation("automations");
  const { data = [], isError } = useAutomationDiagnostics(id);
  if (isError)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("diagnostics.unavailable")}
      </p>
    );
  if (!data.length) return null;
  return (
    <aside
      className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4"
      aria-label={t("diagnostics.title")}
    >
      <h2 className="font-semibold">{t("diagnostics.title")}</h2>
      {data.map((diagnostic, index) => (
        <p key={index} className="text-sm">
          {t(`diagnostics.${diagnostic.code}`)} {diagnostic.target.device_id}/
          {diagnostic.target.attribute}
          {diagnostic.other_automation_id && (
            <>
              {" "}
              ·{" "}
              <ResourceLink
                className="underline"
                to={`/automations/${diagnostic.other_automation_id}`}
              >
                {t("diagnostics.openOther")}
              </ResourceLink>
            </>
          )}
        </p>
      ))}
    </aside>
  );
}
