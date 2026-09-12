import {
  ArrowLeft,
  Check,
  Cpu,
  Info,
  Layers2,
  Loader2,
  Puzzle,
  Search,
} from "lucide-react";
import { Controller } from "react-hook-form";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { DeviceGroup } from "@gridone/sdk";
import { ResourceHeader } from "@/components/ResourceHeader";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DeviceTypeChip } from "@/components/DeviceTypeChip";
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
    driverId,
    selectedCount,
    selectedDriver,
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
      <Link
        to={back}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" />
        {group?.name ?? t("groups.title")}
      </Link>
      <ResourceHeader
        flush
        title={t(group ? "groups.edit" : "groups.create")}
        caption={t("groups.formCaption")}
      />
      <form onSubmit={submit} className="space-y-6">
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
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Card className="min-w-0 rounded-xl">
            <CardHeader>
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Layers2 aria-hidden className="h-4 w-4 text-primary" />
                {t("groups.information")}
              </h2>
              <CardDescription>{t("groups.informationHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Field data-invalid={!!form.formState.errors.name}>
                <FieldLabel htmlFor="group-name">{t("groups.name")}</FieldLabel>
                <Input
                  id="group-name"
                  placeholder={t("groups.namePlaceholder")}
                  className="bg-card"
                  {...form.register("name")}
                  aria-invalid={!!form.formState.errors.name}
                />
                <FieldError errors={[form.formState.errors.name]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="group-description">
                  {t("groups.description")}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {t("groups.optional")}
                  </span>
                </FieldLabel>
                <Textarea
                  id="group-description"
                  rows={3}
                  className="resize-y bg-card"
                  placeholder={t("groups.descriptionPlaceholder")}
                  {...form.register("description")}
                />
              </Field>
              <Field data-invalid={!!form.formState.errors.driver_id}>
                <FieldLabel htmlFor={group ? undefined : "group-driver"}>
                  {t("groups.driver")}
                </FieldLabel>
                {group ? (
                  <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                    <div className="flex min-w-0 items-center gap-2 text-sm">
                      <Puzzle
                        aria-hidden
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                      />
                      <span className="break-all font-mono text-xs">
                        {group.driver_id}
                      </span>
                    </div>
                    <DeviceTypeChip type={selectedDriver?.type} />
                  </div>
                ) : (
                  <select
                    id="group-driver"
                    className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={driverId}
                    onChange={(e) => selectDriver(e.target.value)}
                    aria-invalid={!!form.formState.errors.driver_id}
                    aria-describedby="group-driver-hint"
                    disabled={loading}
                  >
                    <option value="">{t("groups.chooseDriver")}</option>
                    {drivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.id}
                      </option>
                    ))}
                  </select>
                )}
                <p
                  id="group-driver-hint"
                  className="text-xs leading-relaxed text-muted-foreground"
                >
                  {t(group ? "groups.driverFixed" : "groups.driverHint")}
                </p>
                <FieldError errors={[form.formState.errors.driver_id]} />
              </Field>
            </CardContent>
          </Card>
          <Card className="min-w-0 overflow-hidden rounded-xl">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Cpu aria-hidden className="h-4 w-4 text-primary" />
                  {t("groups.members")}
                </h2>
                <Badge variant="info" className="tabular-nums">
                  {t("groups.selectedCount", { count: selectedCount })}
                </Badge>
              </div>
              <CardDescription>{t("groups.membersHint")}</CardDescription>
            </CardHeader>
            {!driverId ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 border-t bg-muted/10 px-6 py-10 text-center">
                <div className="rounded-full bg-muted p-3">
                  <Puzzle
                    aria-hidden
                    className="h-5 w-5 text-muted-foreground"
                  />
                </div>
                <p className="text-sm font-medium">
                  {t("groups.chooseDriver")}
                </p>
                <p className="max-w-xs text-sm text-muted-foreground">
                  {t("groups.chooseDriverHint")}
                </p>
              </div>
            ) : loading ? (
              <div
                role="status"
                aria-label={t("presentation.loading")}
                className="space-y-3 px-6 pb-6"
              >
                <Skeleton className="h-10" />
                <Skeleton className="h-44" />
              </div>
            ) : (
              <>
                <div className="relative mx-6 mb-5">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                  />
                  <Input
                    id="group-search"
                    type="search"
                    aria-label={t("groups.search")}
                    placeholder={t("groups.search")}
                    className="bg-card pl-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Controller
                  control={form.control}
                  name="device_ids"
                  render={({ field }) => (
                    <DevicePickerTable
                      className="max-h-[28rem] rounded-none border-x-0 border-b-0"
                      devices={compatible}
                      selectedIds={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </>
            )}
            <div className="flex items-start gap-2 border-t bg-muted/20 px-6 py-4 text-xs leading-relaxed text-muted-foreground">
              <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>{t("groups.noSynchronization")}</p>
            </div>
          </Card>
        </div>
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/95 px-5 py-4 shadow-sm backdrop-blur-sm">
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Layers2 aria-hidden className="h-4 w-4" />
            {t("groups.selectedEquipment", { count: selectedCount })}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="outline">
              <Link to={back}>{t("groups.cancel")}</Link>
            </Button>
            <Button type="submit" disabled={saving || loading}>
              {saving ? (
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              ) : (
                <Check aria-hidden className="h-4 w-4" />
              )}
              {t("groups.save")}
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}
