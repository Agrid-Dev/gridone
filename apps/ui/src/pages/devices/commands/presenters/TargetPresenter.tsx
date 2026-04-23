import type { ReactNode } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { DeviceTypeChip } from "@/components/DeviceTypeChip";
import { cn } from "@/lib/utils";
import { DeviceType, type DevicesFilter } from "@/api/devices";
import type { Asset } from "@/api/assets";

type TargetPresenterProps = {
  target: DevicesFilter;
  /** Optional name lookup so we can show asset names instead of opaque ids. */
  assetsById?: Record<string, Asset>;
  className?: string;
};

type PresenterContext = {
  t: TFunction;
  assetsById?: Record<string, Asset>;
};

type SubPresenter = (value: never, ctx: PresenterContext) => ReactNode;

/** Map of target-key → value renderer. Adding a new target dimension means
 *  adding a row here and two i18n keys (label under
 *  ``commands.targetPresenter.labels.<key>``, any value-side strings inline).
 *  Unlisted keys are silently ignored. */
const SUB_PRESENTERS: Record<string, SubPresenter> = {
  ids: (ids: string[], { t }) => (
    <Badge variant="outline">
      {t("commands.targetPresenter.deviceCount", { count: ids.length })}
    </Badge>
  ),
  assetId: (id: string, { assetsById }) => (
    <Badge variant="outline">{assetsById?.[id]?.name ?? id}</Badge>
  ),
  types: (types: string[]) => (
    <>
      {types.map((type) => (
        <DeviceTypeChip key={type} type={type as DeviceType} />
      ))}
    </>
  ),
};

export function TargetPresenter({
  target,
  assetsById,
  className,
}: TargetPresenterProps) {
  const { t } = useTranslation("devices");
  const ctx: PresenterContext = { t, assetsById };

  const rows = Object.entries(target)
    .filter(([key, value]) => SUB_PRESENTERS[key] && !isEmptyValue(value))
    .map(([key, value]) => ({
      key,
      label: t(`commands.targetPresenter.labels.${key}`),
      content: SUB_PRESENTERS[key](value as never, ctx),
    }));

  if (rows.length === 0) {
    return (
      <Badge
        variant="outline"
        className={cn("text-muted-foreground", className)}
      >
        {t("commands.targetPresenter.empty")}
      </Badge>
    );
  }

  return (
    <dl className={cn("space-y-1", className)}>
      {rows.map(({ key, label, content }) => (
        <div
          key={key}
          className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
        >
          <dt className="min-w-[7rem] text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </dt>
          <dd className="flex flex-wrap items-center gap-1.5">{content}</dd>
        </div>
      ))}
    </dl>
  );
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}
