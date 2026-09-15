import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { usePermissions } from "@/contexts/AuthContext";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { DevicePickerTable } from "@/components/forms/targetPicker/DevicePickerTable";
import { useTagEditor } from "./useTagEditor";
import { GroupError } from "./GroupError";
import { formatTagCriteria } from "./viewFilters";

export default function TagEditorPage() {
  const { t } = useTranslation("devices");
  const can = usePermissions();
  const editor = useTagEditor();
  const { form, state, mutation } = editor;
  if (!can("devices:write")) return <NotFoundFallback />;
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <ResourceHeader
        title={t("views.editTags")}
        caption={t("views.tagWarning")}
      />
      <form
        onSubmit={editor.submit}
        className="space-y-5 rounded-xl border bg-card p-6"
      >
        <Field>
          <FieldLabel htmlFor="tag-operation">{t("views.editTags")}</FieldLabel>
          <select
            id="tag-operation"
            className="h-10 rounded-md border bg-background px-3"
            {...form.register("operation")}
          >
            <option value="add">{t("views.addTags")}</option>
            <option value="remove">{t("views.removeTags")}</option>
            <option value="rename">{t("views.renameTag")}</option>
          </select>
        </Field>
        {(
          [
            "key",
            "values",
            ...(state.operation === "rename" ? ["newValue" as const] : []),
          ] as const
        ).map((name) => (
          <Field key={name} data-invalid={!!form.formState.errors[name]}>
            <FieldLabel htmlFor={`tag-${name}`}>
              {t(
                name === "key"
                  ? "views.tagKey"
                  : name === "values"
                    ? "views.tagValues"
                    : "views.newValue",
              )}
            </FieldLabel>
            <Input
              id={`tag-${name}`}
              {...form.register(name)}
              list={name === "key" ? "tag-keys" : "tag-values"}
            />
            <FieldError>
              {form.formState.errors[name] && t("views.invalid")}
            </FieldError>
          </Field>
        ))}
        <p className="text-xs text-muted-foreground">{t("views.tagHelp")}</p>
        <datalist id="tag-keys">
          {editor.facets.data
            ?.filter((f) => f.key !== "asset_id")
            .map((f) => (
              <option key={f.key} value={f.key} />
            ))}
        </datalist>
        <datalist id="tag-values">
          {editor.facets.data
            ?.find((f) => f.key === state.key)
            ?.values.map((v) => (
              <option key={v.value} value={v.value} />
            ))}
        </datalist>
        {state.operation === "rename" ? (
          <p>{t("views.renameHelp")}</p>
        ) : (
          <Field data-invalid={!!form.formState.errors.ids}>
            <FieldLabel htmlFor="tag-search">
              {t("views.chooseDevices")}
            </FieldLabel>
            <Input
              id="tag-search"
              placeholder={t("views.search")}
              {...form.register("search")}
            />
            <DevicePickerTable
              devices={editor.visible}
              selectedIds={state.ids}
              onChange={(ids) =>
                form.setValue("ids", ids, { shouldValidate: true })
              }
            />
            <FieldError>
              {form.formState.errors.ids && t("views.chooseDevices")}
            </FieldError>
            {editor.devices.devices
              .filter((d) => state.ids.includes(d.id))
              .map((d) => (
                <p key={d.id} className="text-xs text-muted-foreground">
                  {d.name}: {formatTagCriteria(d.tags) || "—"}
                </p>
              ))}
          </Field>
        )}
        <GroupError
          error={mutation.error || editor.facets.error || editor.devices.error}
        />
        {!!mutation.data && (
          <div role="status" className="space-y-2 rounded-lg border p-4">
            <p>
              {t("views.tagChanged", {
                count: mutation.data.filter((r) => r.status === "changed")
                  .length,
              })}
            </p>
            {mutation.data.some((r) => r.status === "failed") && (
              <p role="alert" className="text-destructive">
                {t("views.tagFailed", {
                  count: mutation.data.filter((r) => r.status === "failed")
                    .length,
                })}
              </p>
            )}
            {mutation.data
              .filter((r) => r.status === "failed")
              .map((r) => (
                <p key={r.device_id}>
                  {editor.devices.devices.find((d) => d.id === r.device_id)
                    ?.name ?? r.device_id}
                </p>
              ))}
          </div>
        )}
        <div className="flex justify-end gap-3">
          <Button asChild type="button" variant="outline">
            <Link to="/devices">{t("groups.cancel")}</Link>
          </Button>
          <Button
            type="submit"
            disabled={mutation.isPending || editor.devices.loading}
          >
            {t(
              state.operation === "rename"
                ? "views.renameTag"
                : state.operation === "add"
                  ? "views.addTags"
                  : "views.removeTags",
            )}
          </Button>
        </div>
      </form>
    </section>
  );
}
