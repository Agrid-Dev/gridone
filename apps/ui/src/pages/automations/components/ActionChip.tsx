import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PencilLine } from "lucide-react";
import type { Action } from "@gridone/sdk";
import { formatValue } from "@/lib/formatValue";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { getActionDescriptor } from "../AutomationPage/presenters/actionRegistry";
import {
  inlineWriteOf,
  isInlineWrite,
} from "../AutomationPage/presenters/commandShape";
import { RuleChip } from "./RuleChip";

/** One-line, chip-shaped rendering of an action: the command template's name,
 *  the inline write, or the notification's title, falling back to the
 *  action-type label. */
export function ActionChip({ action }: { action: Action }) {
  const icon = isInlineWrite(action)
    ? PencilLine
    : getActionDescriptor(action.provider_id).icon;
  return (
    <RuleChip icon={icon}>
      <ActionChipLabel action={action} />
    </RuleChip>
  );
}

function ActionChipLabel({ action }: { action: Action }) {
  const { t } = useTranslation("automations");
  if (action.provider_id === "command_template") {
    return isInlineWrite(action) ? (
      <InlineWriteLabel action={action} />
    ) : (
      <CommandTemplateLabel action={action} />
    );
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

function InlineWriteLabel({ action }: { action: Action }) {
  const { t } = useTranslation("automations");
  const write = inlineWriteOf(action);
  if (!write) return <>{t("actions.types.inline_write")}</>;
  return (
    <>
      {write.attribute} → {formatValue(write.value)}
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
