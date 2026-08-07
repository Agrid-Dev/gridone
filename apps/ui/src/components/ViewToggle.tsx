import { useTranslation } from "react-i18next";
import { LayoutGrid, Table2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isResourceView, type ResourceView } from "@/lib/viewPreference";

const VIEW_ICONS = {
  table: Table2,
  grid: LayoutGrid,
} as const;

const VIEWS: ResourceView[] = ["table", "grid"];

/** Table-or-cards switch for a resource list. Labels are visually hidden:
 *  the icons are the control, the text is what a screen reader announces. */
export function ViewToggle({
  value,
  onChange,
}: {
  value: ResourceView;
  onChange: (view: ResourceView) => void;
}) {
  const { t } = useTranslation("common");

  return (
    <Tabs
      value={value}
      onValueChange={(next) => isResourceView(next) && onChange(next)}
      variant="pill"
    >
      <TabsList aria-label={t("common.view.label")} className="h-9">
        {VIEWS.map((view) => {
          const Icon = VIEW_ICONS[view];
          return (
            <TabsTrigger key={view} value={view} className="px-2.5">
              <Icon className="h-4 w-4" aria-hidden />
              <span className="sr-only">{t(`common.view.${view}`)}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
