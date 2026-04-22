import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { DeviceTypeChip } from "@/components/DeviceTypeChip";
import { DeviceType, type DevicesFilter } from "@/api/devices";
import type { Asset } from "@/api/assets";

type TargetPresenterProps = {
  target: DevicesFilter;
  /** Optional name lookup so we can show asset names instead of opaque ids. */
  assetsById?: Record<string, Asset>;
  className?: string;
};

/** Human-readable summary of a DevicesFilter — used on the templates list,
 *  template detail, and command wizard review. Zero-state (empty filter) is
 *  deliberately rendered as "No target" rather than "all devices" because a
 *  template with no target is a configuration error, not a wildcard. */
export function TargetPresenter({
  target,
  assetsById,
  className,
}: TargetPresenterProps) {
  const { t } = useTranslation("devices");

  const hasIds = target.ids && target.ids.length > 0;
  const hasTypes = target.types && target.types.length > 0;
  const hasAsset = !!target.assetId;
  const hasTags = target.tags && Object.keys(target.tags).length > 0;

  const empty = !hasIds && !hasTypes && !hasAsset && !hasTags;

  if (empty) {
    return (
      <span className={className}>
        <Badge variant="outline" className="text-muted-foreground">
          {t("commands.targetPresenter.empty")}
        </Badge>
      </span>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className ?? ""}`}>
      {hasIds && (
        <Badge variant="outline">
          {t("commands.targetPresenter.deviceCount", {
            count: target.ids!.length,
          })}
        </Badge>
      )}
      {hasAsset && (
        <Badge variant="outline">
          <span className="text-muted-foreground mr-1">
            {t("commands.targetPresenter.asset")}:
          </span>
          {assetsById?.[target.assetId!]?.name ?? target.assetId}
        </Badge>
      )}
      {hasTypes &&
        target.types!.map((type) => (
          <DeviceTypeChip key={type} type={type as DeviceType} />
        ))}
      {hasTags &&
        Object.entries(target.tags!).flatMap(([key, values]) =>
          values.map((v) => (
            <Badge
              key={`${key}:${v}`}
              variant="outline"
              className="font-mono text-xs"
            >
              {key}={v}
            </Badge>
          )),
        )}
    </div>
  );
}
