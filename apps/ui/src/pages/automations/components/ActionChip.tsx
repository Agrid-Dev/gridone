import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Action } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { getActionDescriptor } from "../AutomationPage/presenters/actionRegistry";
import { RuleChip } from "./RuleChip";

/** One-line, chip-shaped rendering of an action: the command template's name
 *  or the notification's title, falling back to the action-type label. */
export function ActionChip({ action }: { action: Action }) {
  const { icon } = getActionDescriptor(action.provider_id);
  return (
    <RuleChip icon={icon}>
      <ActionChipLabel action={action} />
    </RuleChip>
  );
}

function ActionChipLabel({ action }: { action: Action }) {
  const { t } = useTranslation("automations");
  if (action.provider_id === "command_template") {
    return <CommandTemplateLabel action={action} />;
  }
  if (action.provider_id === "notification") {
    const title =
      typeof action.params?.title === "string" ? action.params.title : "";
    return <>{title || t("actions.types.notification")}</>;
  }
  return (
    <>
      {t(`actions.types.${action.provider_id}`, {
        defaultValue: action.provider_id,
      })}
    </>
  );
}

function CommandTemplateLabel({ action }: { action: Action }) {
  const { t } = useTranslation("automations");
  const client = useGridoneClient();
  const templateId =
    typeof action.params?.template_id === "string"
      ? action.params.template_id
      : "";

  const { data: template, isPending } = useQuery({
    queryKey: ["command-templates", templateId],
    queryFn: () => client.devices.commandTemplates.get(templateId),
    enabled: !!templateId,
  });

  // Ephemeral templates have a null name — fall back to the type label.
  if (template?.name) return <>{template.name}</>;
  if (templateId && isPending) return <>…</>;
  return <>{t("actions.types.command_template")}</>;
}
