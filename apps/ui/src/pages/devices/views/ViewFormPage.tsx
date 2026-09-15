import { Link, useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { DeviceView } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { ResourceHeader } from "@/components/ResourceHeader";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import { usePermissions } from "@/contexts/AuthContext";
import { useDeviceView } from "./useDeviceViews";
import { useViewForm } from "./useViewForm";
import { GroupError } from "./GroupError";
import { GroupForm } from "./GroupForm";
import { groupTagValue } from "./groupMembership";

export default function ViewFormPage() {
  const { viewId } = useParams();
  const [params] = useSearchParams();
  const view = useDeviceView(viewId ?? "");
  const { t } = useTranslation("devices");
  const can = usePermissions();
  if (!can("devices:write")) return <NotFoundFallback />;
  if (viewId && view.isLoading)
    return <p role="status">{t("presentation.loading")}</p>;
  if (viewId && !view.data) return <NotFoundFallback />;
  if (
    view.data
      ? groupTagValue(view.data) !== null
      : params.get("advanced") !== "1"
  )
    return <GroupForm key={viewId ?? "new"} view={view.data} />;
  return <ViewForm key={viewId ?? "new"} view={view.data} />;
}
function ViewForm({ view }: { view?: DeviceView }) {
  const { t } = useTranslation("devices");
  const { form, submit, save, facets, drivers } = useViewForm(view);
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <ResourceHeader
        title={t(view ? "views.edit" : "views.create")}
        caption={t("views.description")}
      />
      <form
        onSubmit={submit}
        className="space-y-5 rounded-xl border bg-card p-6"
      >
        {(["name", "description", "tags", "groupBy"] as const).map((name) => (
          <Field key={name} data-invalid={!!form.formState.errors[name]}>
            <FieldLabel htmlFor={`view-${name}`}>
              {t(`views.fields.${name}`)}
            </FieldLabel>
            <Input
              id={`view-${name}`}
              {...form.register(name)}
              list={
                name === "groupBy"
                  ? "view-tag-keys"
                  : name === "tags"
                    ? "view-tag-values"
                    : undefined
              }
            />
            {(name === "tags" || name === "groupBy") && (
              <p className="text-xs text-muted-foreground">
                {t(`views.help.${name}`)}
              </p>
            )}
            <FieldError>
              {form.formState.errors[name] && t("views.invalid")}
            </FieldError>
          </Field>
        ))}
        <datalist id="view-tag-keys">
          {facets.data?.map((f) => (
            <option key={f.key} value={f.key} />
          ))}
        </datalist>
        <datalist id="view-tag-values">
          {facets.data?.flatMap((f) =>
            f.values.map((v) => (
              <option
                key={`${f.key}:${v.value}`}
                value={`${f.key}:${v.value}`}
              />
            )),
          )}
        </datalist>
        <Field>
          <FieldLabel htmlFor="view-driver">{t("groups.driver")}</FieldLabel>
          <select
            id="view-driver"
            className="h-10 rounded-md border bg-background px-3"
            {...form.register("driverId")}
          >
            <option value="">{t("views.allDrivers")}</option>
            {drivers.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.vendor} {d.model ?? d.id}
              </option>
            ))}
          </select>
        </Field>
        <GroupError error={save.error || facets.error || drivers.error} />
        <div className="flex justify-end gap-3">
          <Button type="button" asChild variant="outline">
            <Link to={view ? `/devices/views/${view.id}` : "/devices/views"}>
              {t("groups.cancel")}
            </Link>
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {t("views.save")}
          </Button>
        </div>
      </form>
    </section>
  );
}
