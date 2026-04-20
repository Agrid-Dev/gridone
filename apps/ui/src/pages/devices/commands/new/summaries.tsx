import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { toLabel } from "@/lib/textFormat";
import { formatValue } from "@/lib/formatValue";
import type { Device } from "@/api/devices";
import type { WizardFormValues } from "./types";

const MAX_NAMES = 10;

export function TargetSummary({
  selectedDevices,
}: {
  selectedDevices: Device[];
}) {
  const { t } = useTranslation("devices");
  const shown = selectedDevices.slice(0, MAX_NAMES);
  const extra = selectedDevices.length - shown.length;

  return (
    <div className="space-y-1.5">
      <Badge variant="outline">
        {t("commands.new.summary.deviceCount", {
          count: selectedDevices.length,
        })}
      </Badge>
      {shown.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {shown.map((d) => d.name || d.id).join(", ")}
          {extra > 0 && (
            <span> {t("commands.new.summary.andMore", { count: extra })}</span>
          )}
        </p>
      )}
    </div>
  );
}

export function CommandSummary({ values }: { values: WizardFormValues }) {
  if (!values.attribute || values.value === undefined) {
    return <span>—</span>;
  }
  return (
    <span className="text-foreground">
      <span className="font-medium">{toLabel(values.attribute)}</span>
      <span className="mx-2 text-muted-foreground">=</span>
      <span className="font-mono tabular-nums">
        {formatValue(values.value, values.attributeDataType)}
      </span>
    </span>
  );
}
