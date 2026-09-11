import { Controller } from "react-hook-form";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { DeviceGroup } from "@gridone/sdk";
import { ResourceHeader } from "@/components/ResourceHeader";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { DevicePickerTable } from "@/components/forms/targetPicker/DevicePickerTable";
import { usePermissions } from "@/contexts/AuthContext";
import { useDeviceGroup, useGroupReferences } from "./useDeviceGroups";
import { useGroupForm } from "./useGroupForm";
import { GroupError, GroupReferenceLinks } from "./GroupError";

export default function GroupFormPage() {
  const { groupId } = useParams();
  return groupId ? <EditGroup id={groupId} /> : <GroupForm />;
}

function EditGroup({ id }: { id: string }) {
  const { t } = useTranslation("devices");
  const query = useDeviceGroup(id);
  if (query.isLoading) return <p role="status">{t("presentation.loading")}</p>;
  if (!query.data) return <NotFoundFallback />;
  return <GroupForm key={id} group={query.data} />;
}

function GroupForm({ group }: { group?: DeviceGroup }) {
  const { t } = useTranslation("devices");
  const can = usePermissions();
  const { data: references } = useGroupReferences(group?.id);
  const {
    form,
    drivers,
    compatible,
    search,
    setSearch,
    selectDriver,
    submit,
    saving,
    loading,
    error,
  } = useGroupForm(group);
  const back = group ? `/devices/groups/${group.id}` : "/devices/groups";
  if (!can("devices:write")) return <NotFoundFallback />;
  return (
    <section className="space-y-6">
      <ResourceHeader title={t(group ? "groups.edit" : "groups.create")} />
      <form onSubmit={submit} className="max-w-3xl space-y-5">
        <GroupError error={error} />
        {!!references?.length && (
          <div
            role="status"
            className="rounded-lg border border-amber-300 bg-amber-50/30 p-4 text-sm"
          >
            <p>{t("groups.membershipWarning")}</p>
            <GroupReferenceLinks resources={references} />
          </div>
        )}
        <Field data-invalid={!!form.formState.errors.name}>
          <FieldLabel htmlFor="group-name">{t("groups.name")}</FieldLabel>
          <Input
            id="group-name"
            {...form.register("name")}
            aria-invalid={!!form.formState.errors.name}
          />
          <FieldError errors={[form.formState.errors.name]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="group-description">
            {t("groups.description")}
          </FieldLabel>
          <Input id="group-description" {...form.register("description")} />
        </Field>
        <Field data-invalid={!!form.formState.errors.driver_id}>
          <FieldLabel htmlFor="group-driver">{t("groups.driver")}</FieldLabel>
          <select
            id="group-driver"
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={form.watch("driver_id")}
            onChange={(e) => selectDriver(e.target.value)}
            disabled={!!group}
          >
            <option value="">{t("groups.chooseDriver")}</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.id}
              </option>
            ))}
          </select>
          <FieldError errors={[form.formState.errors.driver_id]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="group-search">{t("groups.members")}</FieldLabel>
          <Input
            id="group-search"
            placeholder={t("groups.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Controller
            control={form.control}
            name="device_ids"
            render={({ field }) => (
              <DevicePickerTable
                devices={compatible}
                selectedIds={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </Field>
        <p className="text-sm text-muted-foreground">
          {t("groups.noSynchronization")}
        </p>
        <div className="flex justify-end gap-3">
          <Button asChild variant="outline">
            <Link to={back}>{t("groups.cancel")}</Link>
          </Button>
          <Button type="submit" disabled={saving || loading}>
            {t("groups.save")}
          </Button>
        </div>
      </form>
    </section>
  );
}
