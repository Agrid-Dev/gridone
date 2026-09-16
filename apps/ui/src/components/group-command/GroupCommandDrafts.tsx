import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { attributeValueText } from "@/lib/attributeValueLabel";
import { localize } from "@/lib/localizedText";
import type { GroupAttribute } from "./groupAttributes";
import type { GroupCommandWrite } from "./useGroupCommand";

export function GroupCommandDrafts({
  writes,
  attributes,
  disabled,
  onRemove,
  onClear,
  emptyHint,
}: {
  writes: GroupCommandWrite[];
  attributes: Record<string, GroupAttribute>;
  disabled: boolean;
  onRemove: (attribute: string) => void;
  onClear: () => void;
  /** Shown instead of nothing when no setpoint is staged yet. A layout that
   *  reserves a slot for this panel would otherwise collapse. */
  emptyHint?: string;
}) {
  const { t, i18n } = useTranslation("devices");
  const { t: tCommon } = useTranslation("common");
  if (!writes.length) {
    return emptyHint ? (
      <section
        aria-label={t("groups.draftTitle")}
        className="space-y-2 rounded-lg border border-dashed p-4"
      >
        <h4 className="font-semibold">{t("groups.draftTitle")}</h4>
        <p className="text-sm text-muted-foreground">{emptyHint}</p>
      </section>
    ) : null;
  }
  return (
    <section
      aria-label={t("groups.draftTitle")}
      className="space-y-4 rounded-lg border border-primary/25 bg-primary/5 p-4"
    >
      <div>
        <h4 className="font-semibold">{t("groups.draftTitle")}</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("groups.draftDescription")}
        </p>
      </div>
      <ul className="divide-y">
        {writes.map((write) => {
          const attribute = attributes[write.attribute];
          const label = attribute?.label
            ? localize(attribute.label, i18n.language)
            : write.attribute;
          return (
            <li
              key={write.attribute}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <span>{label}</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold tabular-nums">
                  {attributeValueText(write.attribute, write.value, tCommon)}
                  {attribute?.unit ? ` ${attribute.unit}` : ""}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={t("groups.removeDraft", { attribute: label })}
                  disabled={disabled}
                  onClick={() => onRemove(write.attribute)}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={onClear}
        >
          {t("groups.clearDrafts")}
        </Button>
      </div>
    </section>
  );
}
