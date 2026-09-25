import { useMemo, useState, type ReactNode } from "react";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, FilePlus2 } from "lucide-react";
import type { Projection, SynopticSummary } from "@gridone/sdk";
import { InputController } from "@/components/forms/controllers/InputController";
import type { PlateDocument } from "@/components/synoptic/SynopticRenderer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { cn } from "@/lib/utils";
import { emptyDocument, hasRaisedElements, toDocument } from "./document";
import { LinkTargetList } from "./panel/LinkTargetList";

type Values = {
  name: string;
  projection: Projection;
  start: "blank" | "duplicate";
  source: string | null;
};

/** A choice drawn as a card, pressed when chosen. */
function Choice({
  on,
  icon,
  title,
  hint,
  disabled,
  onClick,
}: {
  on: boolean;
  icon: ReactNode;
  title: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex flex-1 items-start gap-3 rounded-lg border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        on
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "hover:bg-muted",
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
        {icon}
      </span>
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

/**
 * How a new plate starts: its name, the view its operators open it on,
 * and from nothing or from a copy of another plate of the site. Nothing is
 * saved here: the dialog hands the editor its first draft, which the
 * author saves when it is ready.
 */
export function NewSynopticDialog({
  open,
  synoptics,
  onStart,
  onCancel,
}: {
  open: boolean;
  synoptics: SynopticSummary[];
  onStart: (doc: PlateDocument) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(["synoptics", "common"]);
  const client = useGridoneClient();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const schema = useMemo(
    () =>
      z
        .object({
          name: z.string().trim().min(1, t("editor.create.nameRequired")),
          projection: z.enum(["isometric", "flat"]),
          start: z.enum(["blank", "duplicate"]),
          source: z.string().nullable(),
        })
        .refine((v) => v.start === "blank" || !!v.source, {
          path: ["source"],
          message: t("editor.create.sourceRequired"),
        }),
    [t],
  );
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      name: "",
      projection: "isometric",
      start: "blank",
      source: null,
    },
  });
  const projection = useController({
    control: form.control,
    name: "projection",
  });
  const start = useController({ control: form.control, name: "start" });
  const source = useController({ control: form.control, name: "source" });

  // The schema trims the name, and the values handed here are the parsed
  // ones.
  const submit = form.handleSubmit(async (values) => {
    const { name } = values;
    if (values.start === "blank" || !values.source) {
      onStart(emptyDocument(name, values.projection));
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      const copied = toDocument(await client.synoptics.get(values.source));
      // A plate with anything raised cannot open flat: it keeps its view.
      const raised = values.projection === "flat" && hasRaisedElements(copied);
      if (raised) toast.info(t("editor.create.raised"));
      onStart({
        ...copied,
        name,
        projection: raised ? "isometric" : values.projection,
      });
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-xl">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{t("editor.create.title")}</DialogTitle>
            <DialogDescription>
              {t("editor.create.description")}
            </DialogDescription>
          </DialogHeader>
          <InputController
            name="name"
            control={form.control}
            label={t("editor.create.name")}
            required
            inputProps={{ placeholder: t("editor.create.namePlaceholder") }}
          />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              {t("editor.create.view")}
            </legend>
            <p className="text-xs text-muted-foreground">
              {t("editor.create.viewHint")}
            </p>
            <div className="flex gap-2">
              {(["isometric", "flat"] as const).map((view) => (
                <Choice
                  key={view}
                  on={projection.field.value === view}
                  icon={
                    <span className="text-xs font-semibold">
                      {view === "flat" ? "2D" : "3D"}
                    </span>
                  }
                  title={t(view === "flat" ? "view.plan" : "view.isometric")}
                  hint={t(`editor.create.views.${view}`)}
                  onClick={() => projection.field.onChange(view)}
                />
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              {t("editor.create.start")}
            </legend>
            <div className="flex gap-2">
              <Choice
                on={start.field.value === "blank"}
                icon={<FilePlus2 aria-hidden className="size-4" />}
                title={t("editor.create.blank")}
                hint={t("editor.create.blankHint")}
                onClick={() => start.field.onChange("blank")}
              />
              <Choice
                on={start.field.value === "duplicate"}
                icon={<Copy aria-hidden className="size-4" />}
                title={t("editor.create.duplicate")}
                hint={t("editor.create.duplicateHint")}
                disabled={synoptics.length === 0}
                onClick={() => start.field.onChange("duplicate")}
              />
            </div>
            {start.field.value === "duplicate" && (
              <div className="space-y-1">
                <LinkTargetList
                  label={t("editor.create.source")}
                  allowNone={false}
                  value={source.field.value}
                  synoptics={synoptics}
                  onChange={(id) => source.field.onChange(id)}
                />
                {source.fieldState.error && (
                  <p role="alert" className="text-sm text-destructive">
                    {source.fieldState.error.message}
                  </p>
                )}
              </div>
            )}
          </fieldset>
          {failed && (
            <p role="alert" className="text-sm text-destructive">
              {t("editor.create.failed")}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t("common:common.cancel")}
            </Button>
            {/* Always pressable: a press on an incomplete form says what
                is missing, where a greyed button would say nothing. */}
            <Button type="submit" disabled={loading}>
              {loading ? t("editor.create.loading") : t("editor.create.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
