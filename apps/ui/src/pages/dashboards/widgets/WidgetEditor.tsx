import { useState } from "react";
import type { FC } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import type { Widget, WidgetSchemas } from "@gridone/sdk";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  WidgetForm,
  type WidgetFormState,
  type WidgetFormValues,
} from "./WidgetForm";
import { WidgetPreview } from "./WidgetPreview";
import { WidgetTypeBand } from "./WidgetTypeBand";

/** Ties the page-level submit button to the config form it commits. */
const FORM_ID = "widget-editor-form";

interface WidgetEditorProps {
  dashboardId: string;
  /** Shown as the header caption — the dashboard the widget belongs to. */
  dashboardName: string;
  title: string;
  submitLabel: string;
  /** type → JSON Schema of that type's config (from GET widget-schemas). */
  schemas: WidgetSchemas;
  /** Edit mode: seeds the form, locks the type and previews the widget at its
   *  current grid footprint. Absent when creating. */
  widget?: Widget;
  onSubmit: (values: WidgetFormValues) => Promise<void>;
}

/**
 * Full-page widget editor shared by the create and edit routes. The type band
 * and the commit actions span the page because they govern both panels; between
 * them sit the config form and a live preview of what it describes. Leaving
 * with unsaved changes asks for confirmation first.
 */
export const WidgetEditor: FC<WidgetEditorProps> = ({
  dashboardId,
  dashboardName,
  title,
  submitLabel,
  schemas,
  widget,
  onSubmit,
}) => {
  const { t } = useTranslation(["dashboards", "common"]);
  const navigate = useNavigate();
  const types = Object.keys(schemas);
  const [type, setType] = useState(widget?.type ?? types[0]);
  const [{ draft, dirty, submitting }, setFormState] =
    useState<WidgetFormState>({ draft: null, dirty: false, submitting: false });
  const [discardOpen, setDiscardOpen] = useState(false);

  const leave = () => navigate(`/dashboards/${dashboardId}`);
  // Back and Cancel are the only ways out that can lose work, so they ask.
  const requestLeave = () => (dirty ? setDiscardOpen(true) : leave());

  return (
    <section className="flex flex-col gap-6">
      <ResourceHeader
        title={title}
        caption={dashboardName}
        actions={
          <Button variant="outline" size="sm" onClick={requestLeave}>
            <ArrowLeft className="h-4 w-4" />
            {t("widgets.editor.back")}
          </Button>
        }
      />

      <WidgetTypeBand
        types={types}
        value={type}
        onChange={setType}
        locked={widget !== undefined}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
            {t("widgets.editor.configuration")}
          </p>
          <div className="rounded-lg border border-border bg-card p-4">
            {/* Keyed by type: switching type swaps the whole schema-driven
                form. */}
            <WidgetForm
              key={type}
              type={type}
              configSchema={schemas[type]}
              defaultTitle={widget?.title ?? undefined}
              defaultConfig={
                type === widget?.type
                  ? (widget.config as unknown as Record<string, unknown>)
                  : undefined
              }
              formId={FORM_ID}
              onSubmit={onSubmit}
              onStateChange={setFormState}
            />
          </div>
        </div>
        {/* Sticky so the preview stays in view while the form scrolls. */}
        <div className="lg:sticky lg:top-24">
          <WidgetPreview draft={draft} size={widget?.layout} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={requestLeave}>
          {t("common:common.cancel")}
        </Button>
        <Button
          type="submit"
          form={FORM_ID}
          disabled={draft === null || submitting}
        >
          {submitLabel}
        </Button>
      </div>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("widgets.editor.discard.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("widgets.editor.discard.details")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("widgets.editor.discard.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={leave}>
              {t("widgets.editor.discard.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};
