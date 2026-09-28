import { useTranslation } from "react-i18next";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { hasRaisedElements } from "./document";
import { SegmentedControl } from "./panel/SegmentedControl";
import type { SynopticEditorState } from "./useSynopticEditor";

/**
 * The plate's own settings: the description operators read under its
 * name, and the view it opens on. The plan can be that view only while
 * nothing on the plate stands above the floor: the backend refuses any
 * height on a plate that opens flat.
 */
export function ViewSettings({ editor }: { editor: SynopticEditorState }) {
  const { t } = useTranslation("synoptics");
  const { doc } = editor;
  const raised = hasRaisedElements(doc);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("editor.settings.title")}
          title={t("editor.settings.title")}
        >
          <Settings2 aria-hidden className="size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4">
        <h2 className="font-display text-base font-semibold">
          {t("editor.settings.title")}
        </h2>
        <div className="space-y-1.5">
          <Label htmlFor="plate-description">{t("description.title")}</Label>
          <Textarea
            id="plate-description"
            rows={3}
            value={doc.description ?? ""}
            onChange={(e) => editor.typeDescription(e.target.value)}
            onBlur={editor.history.settle}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("editor.settings.view")}</Label>
          <SegmentedControl
            label={t("editor.settings.view")}
            value={doc.projection ?? "isometric"}
            onChange={editor.setProjection}
            options={[
              { value: "isometric", label: t("view.isometric") },
              {
                value: "flat",
                label: t("view.plan"),
                disabled: raised && doc.projection !== "flat",
                title: raised ? t("editor.settings.raised") : undefined,
              },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            {raised && doc.projection !== "flat"
              ? t("editor.settings.raised")
              : t("editor.settings.viewHint")}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
