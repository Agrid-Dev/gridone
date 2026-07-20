import { useState } from "react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import type { WidgetCreateBody } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WidgetForm, type WidgetFormValues } from "./WidgetForm";
import { useAddWidget, useWidgetSchemas } from "../useWidgets";

/** Adds a widget: pick a type, then fill its schema-driven config form. */
export const AddWidgetButton: FC<{ dashboardId: string }> = ({
  dashboardId,
}) => {
  const { t } = useTranslation(["dashboards", "common"]);
  const [open, setOpen] = useState(false);
  const { addWidget } = useAddWidget(dashboardId);
  const { data: schemas } = useWidgetSchemas();

  const handleAdd = async (values: WidgetFormValues) => {
    const ok = await addWidget({
      config: values.config as WidgetCreateBody["config"],
      title: values.title || undefined,
    })
      .then(() => true)
      .catch(() => false);
    if (ok) {
      setOpen(false);
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        {t("widgets.add")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("widgets.addTitle")}</DialogTitle>
          </DialogHeader>
          {schemas ? (
            <WidgetForm
              schemas={schemas}
              submitLabel={t("widgets.addSubmit")}
              onSubmit={handleAdd}
              onCancel={() => setOpen(false)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("common:common.loading")}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
