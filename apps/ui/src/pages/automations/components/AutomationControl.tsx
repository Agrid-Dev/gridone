import { useTranslation } from "react-i18next";
import type { Automation } from "@gridone/sdk";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { TextareaController } from "@/components/forms/controllers/TextAreaController";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAutomationControl } from "./useAutomationControl";

export function AutomationControl({ automation }: { automation: Automation }) {
  const { t } = useTranslation("automations");
  const { open, setOpen, form, mutation, submit } =
    useAutomationControl(automation);
  return (
    <>
      <Switch
        checked={automation.enabled ?? true}
        onCheckedChange={() => setOpen(true)}
        aria-label={t(
          automation.enabled ? "actions.disable" : "actions.enable",
        )}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t(
                automation.enabled
                  ? "suspension.title"
                  : "suspension.resumeTitle",
                { name: automation.name },
              )}
            </DialogTitle>
            <DialogDescription>
              {t(
                automation.enabled
                  ? "suspension.help"
                  : "suspension.resumeHelp",
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {automation.enabled && (
              <TextareaController
                name="reason"
                control={form.control}
                label={t("suspension.reason")}
                required
              />
            )}
            {mutation.isError && (
              <p role="alert" className="text-sm text-destructive">
                {t("toasts.saveError")}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                {t("tree.cancel")}
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {t(
                  automation.enabled
                    ? "suspension.confirm"
                    : "suspension.resume",
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
