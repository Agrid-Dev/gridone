import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { Device } from "@gridone/sdk";
import { commandFailureLabel } from "@/lib/commandFailure";
import { formatValue } from "@/lib/formatValue";
import { localize } from "@/lib/localizedText";
import { GroupError } from "./GroupError";
import type { GroupAttribute } from "./groupAttributes";
import type { useGroupCommand } from "./useGroupCommand";

export function GroupCommandResults({
  command,
  devices,
  attributes,
}: {
  command: ReturnType<typeof useGroupCommand>;
  devices: Device[];
  attributes: Record<string, GroupAttribute>;
}) {
  const { t, i18n } = useTranslation("devices");
  if (!command.batches.length) return null;
  const label = (name: string) => {
    const attribute = attributes[name];
    return attribute?.label ? localize(attribute.label, i18n.language) : name;
  };
  return (
    <div role="status" className="space-y-3 rounded-lg border p-4">
      <p className="font-medium">
        {t("groups.batchSummary", {
          success: command.commands.filter((c) => c.status === "success")
            .length,
          failed: command.commands.filter((c) => c.status === "error").length,
          pending: command.commands.filter((c) => c.status === "pending")
            .length,
        })}
      </p>
      <GroupError error={command.resultsError} />
      <ul className="max-h-64 overflow-auto text-sm">
        {command.commands.map((item) => (
          <li key={item.id} className="flex justify-between gap-4 py-1">
            <span>
              {devices.find((d) => d.id === item.device_id)?.name ??
                item.device_id}
              <span className="ml-2 text-muted-foreground">
                {label(item.attribute)} → {formatValue(item.value)}
              </span>
            </span>
            <span>
              {t(`commands.statusLabels.${item.status}`, {
                defaultValue: item.status,
              })}
              {item.status === "error" &&
                ` · ${commandFailureLabel(t, item.status_details)}`}
            </span>
          </li>
        ))}
      </ul>
      <ul className="space-y-1">
        {command.preparations.map(
          ({ write, batch }) =>
            batch && (
              <li key={batch.batch_id}>
                <Link
                  className="text-sm underline"
                  to={`/devices/commands?batch_id=${encodeURIComponent(batch.batch_id)}`}
                >
                  {command.batches.length === 1
                    ? t("groups.history")
                    : t("groups.historyAttribute", {
                        attribute: label(write.attribute),
                      })}
                </Link>
              </li>
            ),
        )}
      </ul>
    </div>
  );
}
