import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useDeviceGroup, useDeviceGroups } from "./useDeviceGroups";

export function GroupSelect({
  value,
  onChange,
}: {
  value?: string;
  onChange: (id: string | undefined) => void;
}) {
  const { t } = useTranslation("devices");
  const { data: groups } = useDeviceGroups();
  return (
    <div className="space-y-1">
      <select
        className="h-10 max-w-full rounded-md border bg-background px-3 text-sm"
        aria-label={t("groups.chooseGroup")}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        <option value="">{t("groups.noGroup")}</option>
        {value && !groups?.some((group) => group.id === value) && (
          <option value={value}>{value}</option>
        )}
        {groups?.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name} ({group.device_ids?.length ?? 0})
          </option>
        ))}
      </select>
      {value && (
        <p className="text-xs text-muted-foreground">
          {t("groups.dynamicHint")}
        </p>
      )}
    </div>
  );
}

export function GroupTargetLabel({ id }: { id: string }) {
  const { t } = useTranslation("devices");
  const { data: group } = useDeviceGroup(id);
  return (
    <span>
      <Link
        className="underline"
        to={`/devices/groups/${encodeURIComponent(id)}`}
      >
        {group?.name ?? id}
      </Link>
      <span className="ml-2 text-xs text-muted-foreground">
        {t("groups.dynamicHint")}
      </span>
    </span>
  );
}
