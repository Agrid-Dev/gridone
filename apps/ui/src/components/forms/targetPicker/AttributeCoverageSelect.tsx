import { useTranslation } from "react-i18next";
import type { DataType } from "@gridone/sdk";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isEmptyFilter, type DevicesFilter } from "@/lib/devices";
import { toLabel } from "@/lib/textFormat";
import { useAttributeCoverage } from "./useAttributeCoverage";

type AttributeCoverageSelectProps = {
  /** Device set the coverage is computed over. */
  filter: DevicesFilter;
  value?: string;
  onChange: (attribute: string, dataType: DataType) => void;
  /** Only offer attributes writable on at least one matched device. */
  writableOnly?: boolean;
  disabled?: boolean;
  id?: string;
};

/** Controlled select of an attribute over a device set. Options are the
 *  UNION of the set's attributes annotated with coverage ("8/12"); devices
 *  not exposing the chosen attribute are excluded server-side at dispatch.
 *  Attributes with mixed data types across the set cannot be targeted and
 *  render disabled. */
export function AttributeCoverageSelect({
  filter,
  value,
  onChange,
  writableOnly,
  disabled,
  id,
}: AttributeCoverageSelectProps) {
  const { t } = useTranslation("common");
  const { coverage, totalDevices } = useAttributeCoverage(filter, {
    enabled: !isEmptyFilter(filter),
  });

  const rows = writableOnly
    ? coverage.filter((c) => c.writable_count > 0)
    : coverage;

  return (
    <Select
      value={value ?? ""}
      onValueChange={(attribute) => {
        const row = rows.find((c) => c.attribute === attribute);
        if (!row || row.data_types.length !== 1) return;
        onChange(attribute, row.data_types[0]);
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder={t("pickers.attribute.placeholder")} />
      </SelectTrigger>
      <SelectContent>
        {rows.map((row) => {
          const mixed = row.data_types.length > 1;
          return (
            <SelectItem
              key={row.attribute}
              value={row.attribute}
              disabled={mixed}
            >
              <span>{toLabel(row.attribute)}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {mixed
                  ? t("pickers.attribute.mixedTypes")
                  : `(${row.data_types[0]})`}{" "}
                {t("pickers.attribute.coverage", {
                  count: row.device_count,
                  total: totalDevices,
                })}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
