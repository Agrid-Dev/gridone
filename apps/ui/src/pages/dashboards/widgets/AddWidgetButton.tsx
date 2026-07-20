import { useState } from "react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TextWidgetForm, type TextWidgetFormValues } from "./TextWidgetForm";
import { useAddWidget } from "../useWidgets";

/** Adds a widget to the dashboard. Only the `text` type exists today, so the
 *  button opens the text widget form directly (a type picker arrives with more
 *  widget types). */
export const AddWidgetButton: FC<{ dashboardId: string }> = ({
  dashboardId,
}) => {
  const { t } = useTranslation("dashboards");
  const [open, setOpen] = useState(false);
  const { addWidget } = useAddWidget(dashboardId);

  const handleAdd = async (values: TextWidgetFormValues) => {
    const ok = await addWidget({
      config: { type: "text", text: values.text, color: values.color },
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
          <TextWidgetForm
            submitLabel={t("widgets.addSubmit")}
            onSubmit={handleAdd}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};
