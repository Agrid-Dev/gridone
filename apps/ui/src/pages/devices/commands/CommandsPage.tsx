import type { ReactNode } from "react";
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
  header?: ReactNode;
};

export default function CommandsPage({ deviceId, header }: CommandsPageProps) {
  const { t } = useTranslation("devices");
  const can = usePermissions();
  const cmd = useCommands({ deviceId });

  const newCommandHref = deviceId
    ? `/devices/${deviceId}/commands/new`
    : "/devices/commands/new";

  const newCommandButton = can("devices:write") ? (
    <Button asChild size="sm">
      <Link to={newCommandHref}>
        <Terminal />
        {t("commands.newCommand")}
      </Link>
    </Button>
  ) : null;

  return (
    <section className="space-y-6">
      {header ?? (
        <ResourceHeader
          title={t("commands.subtitle")}
          resourceName={t("devices.title")}
          resourceNameLinksBack
          actions={newCommandButton}
        />
      )}

      <CommandsFilterBar
        deviceId={cmd.deviceId}
        attribute={cmd.attribute}
        userId={cmd.userId}
        batchId={cmd.batchId}
        attributeOptions={cmd.attributeOptions}
        devices={cmd.devices}
        users={cmd.users}
        onFilterChange={cmd.setFilter}
        isDeviceFixed={cmd.isDeviceFixed}
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
