import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { Device, DeviceView } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { ResourceHeader } from "@/components/ResourceHeader";
import { DevicePickerTable } from "@/components/forms/targetPicker/DevicePickerTable";
import { useDevicesList } from "@/hooks/useDevicesList";
import { useGroupForm } from "./useGroupForm";
import { GroupError } from "./GroupError";
import { GroupMembershipError } from "./groupMembership";

export function GroupForm({ view }: { view?: DeviceView }) {
  const { t } = useTranslation("devices");
  const members = useDevicesList();
  if (members.loading) return <p role="status">{t("presentation.loading")}</p>;
  if (members.error) return <GroupError error={members.error} />;
  return <GroupEditor devices={members.devices} view={view} />;
}

function GroupEditor({
  devices,
  view,
}: {
  devices: Device[];
  view?: DeviceView;
}) {
  const { t } = useTranslation("devices");
  const editor = useGroupForm(devices, view);
  const { form, state, save } = editor;
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <ResourceHeader
        title={t(view ? "groups.edit" : "groups.create")}
        caption={t("groups.formCaption")}
      />
      <form onSubmit={editor.submit} className="space-y-6">
        <fieldset
          disabled={save.isPending}
          className="space-y-6 disabled:opacity-70"
        >
          <div className="space-y-5 rounded-xl border bg-card p-6">
            <Field data-invalid={!!form.formState.errors.name}>
              <FieldLabel htmlFor="group-name">{t("groups.name")}</FieldLabel>
              <Input
                id="group-name"
                placeholder={t("groups.namePlaceholder")}
                {...form.register("name")}
              />
              <FieldError>
                {form.formState.errors.name && t("groups.nameRequired")}
              </FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="group-description">
                {t("groups.description")} {t("groups.optional")}
              </FieldLabel>
              <Input
                id="group-description"
                placeholder={t("groups.descriptionPlaceholder")}
                {...form.register("description")}
              />
            </Field>
          </div>
          <div className="space-y-4 rounded-xl border bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">{t("groups.chooseDevices")}</h2>
              <span
                role="status"
                className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
              >
                {t("groups.selectedEquipment", { count: state.ids.length })}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("groups.membersHelp")}
            </p>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Field>
                <FieldLabel htmlFor="group-search">
                  {t("views.search")}
                </FieldLabel>
                <Input
                  id="group-search"
                  placeholder={t("groups.searchPlaceholder")}
                  {...form.register("search")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="group-driver">
                  {t("groups.filterDriver")}
                </FieldLabel>
                <select
                  id="group-driver"
                  className="h-10 rounded-md border bg-background px-3"
                  {...form.register("driverId")}
                >
                  <option value="">{t("views.allDrivers")}</option>
                  {editor.driverIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <DevicePickerTable
              devices={editor.visible}
              selectedIds={state.ids}
              onChange={(ids) =>
                form.setValue("ids", ids, { shouldDirty: true })
              }
            />
            {!!state.ids.length && (
              <div
                className="flex flex-wrap gap-2"
                aria-label={t("groups.selectedList")}
              >
                {state.ids.map((id) => {
                  const name =
                    devices.find((device) => device.id === id)?.name ?? id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className="rounded-full border bg-muted px-3 py-1 text-sm hover:bg-muted/60"
                      aria-label={t("groups.removeMember", { name })}
                      onClick={() =>
                        form.setValue(
                          "ids",
                          state.ids.filter((selected) => selected !== id),
                          { shouldDirty: true },
                        )
                      }
                    >
                      {name} ×
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {t("groups.noSynchronization")}
            </p>
          </div>
        </fieldset>
        {save.error instanceof GroupMembershipError ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
          >
            <p>{t("groups.membersSaveFailed")}</p>
            <ul className="mt-2 list-inside list-disc">
              {save.error.deviceIds.map((id) => (
                <li key={id}>
                  {devices.find((device) => device.id === id)?.name ?? id}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <GroupError error={save.error} />
        )}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            asChild
            variant="outline"
            disabled={save.isPending}
          >
            <Link
              to={
                editor.savedId
                  ? `/devices/views/${editor.savedId}`
                  : "/devices/views"
              }
            >
              {t("groups.cancel")}
            </Link>
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {t("groups.save")}
          </Button>
        </div>
      </form>
      {!view && (
        <p className="text-sm text-muted-foreground">
          {t("groups.advancedHint")}{" "}
          <Link className="underline" to="/devices/views/new?advanced=1">
            {t("views.createAdvanced")}
          </Link>
        </p>
      )}
    </section>
  );
}
