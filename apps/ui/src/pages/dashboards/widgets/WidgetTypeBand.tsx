import type { FC } from "react";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toLabel } from "@/lib/textFormat";

/** The widget type, on its own full-width row above the editor panels: it
 *  decides both which fields the form shows and what the preview renders, so
 *  its scope is the whole page rather than the form column.
 *
 *  A widget's type is immutable after creation, so editing shows it as a
 *  read-only value instead of a disabled control. */
export const WidgetTypeBand: FC<{
  types: string[];
  value: string;
  onChange: (type: string) => void;
  locked?: boolean;
}> = ({ types, value, onChange, locked = false }) => {
  const { t } = useTranslation("dashboards");

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-4 py-3">
      <label
        htmlFor="widget-type"
        className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground"
      >
        {t("widgets.fields.type")}
      </label>
      {locked ? (
        <span
          id="widget-type"
          className="rounded-md border border-border bg-muted px-2.5 py-1 text-sm font-medium"
        >
          {toLabel(value)}
        </span>
      ) : (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id="widget-type" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {types.map((type) => (
              <SelectItem key={type} value={type}>
                {toLabel(type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
};
