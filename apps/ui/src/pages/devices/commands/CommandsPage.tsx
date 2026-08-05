import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResourceHeader } from "@/components/ResourceHeader";
import { usePermissions } from "@/contexts/AuthContext";
import { useCommands } from "@/hooks/useCommands";
import { CommandsFilterBar } from "./CommandsFilterBar";
import { CommandsTable } from "./CommandsTable";

type CommandsPageProps = {
  deviceId?: string;
  /** Set when the page is nested in a frame that already renders its own header
   *  and "send a command" action — both are dropped to avoid duplicating them. */
  embedded?: boolean;
};

export default function CommandsPage({
  deviceId,
  embedded = false,
}: CommandsPageProps) {
  const { t } = useTranslation("devices");
  const can = usePermissions();
  const cmd = useCommands({ deviceId });

  const newCommandHref = deviceId
    ? `/devices/${deviceId}/commands/new`
    : "/devices/commands/new";

  const newCommandButton =
    !embedded && can("devices:write") ? (
      <Button asChild size="sm">
        <Link to={newCommandHref}>
          <Terminal />
          {t("commands.newCommand")}
        </Link>
      </Button>
    ) : null;

  return (
    <section className="space-y-6">
      {!embedded && (
        <ResourceHeader
          title={t("commands.title")}
          actions={
            <Button asChild size="sm" variant="outline">
              <Link to="/devices/commands/templates">
                {t("commands.templates.title")}
              </Link>
            </Button>
          }
        />
      )}

      <CommandsFilterBar
        deviceId={cmd.deviceId}
        attribute={cmd.attribute}
        userId={cmd.userId}
        batchId={cmd.batchId}
        templateId={cmd.templateId}
        attributeOptions={cmd.attributeOptions}
        devices={cmd.devices}
        users={cmd.users}
        templates={cmd.templates}
        onFilterChange={cmd.setFilter}
        isDeviceFixed={cmd.isDeviceFixed}
        actions={newCommandButton}
      />

      <CommandsTable
        table={cmd.table}
        data={cmd.data}
        isLoading={cmd.isLoading}
        isPlaceholderData={cmd.isPlaceholderData}
        error={cmd.error}
        prevHref={cmd.prevHref}
        nextHref={cmd.nextHref}
      />
    </section>
  );
}
