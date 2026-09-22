import { Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { AutomationBranch } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import { InputController } from "@/components/forms/controllers/InputController";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { ConditionEditor } from "@/pages/devices/device/operating-rules/ConditionEditor";
import { emptyCondition } from "@/pages/devices/device/operating-rules/expressions";
import ActionForm from "../form/ActionForm";
import {
  useAutomationCatalog,
  useAutomationSchema,
  useBranchForm,
} from "../hooks/useDecisionTree";

export function BranchEditor({
  initial,
  onSave,
  onClose,
}: {
  initial?: AutomationBranch;
  onSave: (branch: AutomationBranch) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("automations");
  const schema = useAutomationSchema();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogTitle>{t("tree.editBranch")}</DialogTitle>
        <DialogDescription>{t("tree.firstMatch")}</DialogDescription>
        {schema.data ? (
          <BranchForm
            schema={schema.data}
            initial={initial}
            onSave={onSave}
            onClose={onClose}
          />
        ) : (
          <p role="status">
            {schema.isError ? t("toasts.saveError") : t("tree.loading")}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BranchForm({
  schema,
  initial,
  onSave,
  onClose,
}: {
  schema: Record<string, unknown>;
  initial?: AutomationBranch;
  onSave: (branch: AutomationBranch) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("automations");
  const { form, actionValid, onActionChange } = useBranchForm(schema, initial);
  const catalog = useAutomationCatalog();
  return (
    <div className="space-y-6">
      <form
        id="automation-branch"
        onSubmit={form.handleSubmit(onSave)}
        className="space-y-4"
      >
        <InputController
          control={form.control}
          name="name"
          label={t("tree.branchName")}
        />
        <Controller
          control={form.control}
          name="condition"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <div className="flex items-center justify-between gap-4">
                <FieldLabel htmlFor="branch-condition">
                  {t("tree.useCondition")}
                </FieldLabel>
                <Switch
                  id="branch-condition"
                  checked={field.value != null}
                  onCheckedChange={(checked) =>
                    field.onChange(checked ? emptyCondition() : null)
                  }
                />
              </div>
              {field.value ? (
                <ConditionEditor
                  value={field.value}
                  onChange={field.onChange}
                  catalog={catalog}
                  eventContext
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("tree.always")}
                </p>
              )}
              {fieldState.invalid && (
                <p role="alert" className="text-sm text-destructive">
                  {t("tree.invalidCondition")}
                </p>
              )}
            </Field>
          )}
        />
      </form>
      <ActionForm
        initialValue={initial?.action}
        onChange={onActionChange}
        onSubmit={() => void form.handleSubmit(onSave)()}
        onCancel={onClose}
        hideActions
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          {t("tree.cancel")}
        </Button>
        <Button form="automation-branch" type="submit" disabled={!actionValid}>
          {t("tree.applyBranch")}
        </Button>
      </div>
    </div>
  );
}
