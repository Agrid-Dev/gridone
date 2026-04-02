import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ResourceHeader } from "@/components/ResourceHeader";
import { useCommands } from "@/hooks/useCommands";
import { CommandsFilterBar } from "./CommandsFilterBar";
import { CommandsTable } from "./CommandsTable";

type CommandsPageProps = {
  deviceId?: string;
  header?: ReactNode;
};

export default function CommandsPage({ deviceId, header }: CommandsPageProps) {
  const { t } = useTranslation("devices");
  const cmd = useCommands({ deviceId });

  return (
    <section className="space-y-6">
      {header ?? (
        <ResourceHeader
          title={t("commands.subtitle")}
          resourceName={t("devices.title")}
          resourceNameLinksBack
        />
      )}

      <CommandsFilterBar
        deviceId={cmd.deviceId}
        attribute={cmd.attribute}
        userId={cmd.userId}
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
