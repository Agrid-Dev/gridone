import { useGroupTargetForm } from "./useGroupTargetForm";
import { useTranslation } from "react-i18next";
import type { Scalar } from "@/components/device-ui/conditions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { GroupAttribute } from "./groupAttributes";
import { localize } from "@/lib/localizedText";

export function GroupTargetDialog({
  attribute,
  onCancel,
  onPrepare,
}: {
  attribute: GroupAttribute;
  onCancel: () => void;
  onPrepare: (value: Scalar) => void;
}) {
  const { t, i18n } = useTranslation("devices");
  const label = attribute.label
    ? localize(attribute.label, i18n.language)
    : attribute.name;
  const { options, form, submit } = useGroupTargetForm(attribute, onPrepare);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("groups.chooseTarget")}</DialogTitle>
          <DialogDescription>
            {t("groups.absoluteTarget", { attribute: label })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field data-invalid={!!form.formState.errors.value}>
            <FieldLabel htmlFor="group-target">
              {label}
              {attribute.unit ? ` (${attribute.unit})` : ""}
            </FieldLabel>
            {options.length ? (
              <select
                id="group-target"
                className="h-10 rounded-md border bg-background px-3"
                {...form.register("value")}
              >
                <option value="">{t("groups.chooseTarget")}</option>
                {options.map((option) => (
                  <option key={String(option)} value={String(option)}>
                    {String(option)}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id="group-target"
                type={
                  attribute.data_type === "int" ||
                  attribute.data_type === "float"
                    ? "number"
                    : "text"
                }
                step="any"
                {...form.register("value")}
              />
            )}
            <FieldError errors={[form.formState.errors.value]} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              {t("groups.cancel")}
            </Button>
            <Button type="submit">{t("groups.preview")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
