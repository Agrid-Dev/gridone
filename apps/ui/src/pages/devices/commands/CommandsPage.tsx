import { useTranslation } from "react-i18next";
import { ResourceHeader } from "@/components/ResourceHeader";
import { useCommands } from "@/hooks/useCommands";
import { CommandsFilterBar } from "./CommandsFilterBar";
import { CommandsTable } from "./CommandsTable";

export default function CommandsPage() {
  const { t } = useTranslation();
  const {
    deviceId,
    attribute,
    userId,
    attributeOptions,
    devices,
    users,
    setFilter,
    table,
    data,
    isLoading,
    isPlaceholderData,
    error,
    prevHref,
    nextHref,
  } = useCommands();

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("commands.subtitle")}
        resourceName={t("devices.title")}
        resourceNameLinksBack
      />

      <CommandsFilterBar
        deviceId={deviceId}
        attribute={attribute}
        userId={userId}
        attributeOptions={attributeOptions}
        devices={devices}
        users={users}
        onFilterChange={setFilter}
      />

      <CommandsTable
        table={table}
        data={data}
        isLoading={isLoading}
        isPlaceholderData={isPlaceholderData}
        error={error}
        prevHref={prevHref}
        nextHref={nextHref}
      />
    </section>
  );
}
