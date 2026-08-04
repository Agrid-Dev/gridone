import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import {
  DEVICE_TYPE_ORDER,
  deviceTypeBucketLabel,
  type DeviceTypeKey,
} from "@/lib/deviceTypes";
import { cn } from "@/lib/utils";

type DeviceTypeChipsProps = {
  /** Unfiltered per-type counts — chips render for non-empty buckets only. */
  counts: Map<DeviceTypeKey, number>;
  total: number;
};

/** One filter chip per device-type bucket present in the fleet ("Tous 49",
 *  "Thermostats 42", …), driving the `?type=` query param. */
export function DeviceTypeChips({ counts, total }: DeviceTypeChipsProps) {
  const { t } = useTranslation("devices");
  const { t: tTypes } = useTranslation("standardDevices");
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = searchParams.get("type");

  const select = (key: DeviceTypeKey | null) => {
    setSearchParams((prev) => {
      const updated = new URLSearchParams(prev);
      if (key === null) updated.delete("type");
      else updated.set("type", key);
      return updated;
    });
  };

  return (
    <div
      role="group"
      aria-label={t("devices.filters.label")}
      className="flex flex-wrap items-center gap-2"
    >
      <Chip
        label={t("devices.filters.all")}
        count={total}
        active={selected === null}
        onClick={() => select(null)}
      />
      {DEVICE_TYPE_ORDER.filter((key) => (counts.get(key) ?? 0) > 0).map(
        (key) => {
          const count = counts.get(key) ?? 0;
          return (
            <Chip
              key={key}
              label={deviceTypeBucketLabel(key, tTypes)}
              count={count}
              active={selected === key}
              onClick={() => select(key)}
            />
          );
        },
      )}
    </div>
  );
}

function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:border-primary/50",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "tabular-nums",
          active ? "text-primary/70" : "text-muted-foreground/70",
        )}
      >
        {count}
      </span>
    </button>
  );
}
