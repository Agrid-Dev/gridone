import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { LockKeyhole } from "lucide-react";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { usePermissions } from "@/contexts/AuthContext";
import { useAssetTree } from "@/hooks/useAssetTree";
import { useDevicesList } from "@/hooks/useDevicesList";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DevicesFilterTabs } from "@/components/forms/targetPicker";
import { localize } from "@/lib/localizedText";
import { toLabel } from "@/lib/textFormat";
import { GroupedCommandFields } from "./GroupedCommandFields";
import { GroupedCommandReview } from "./GroupedCommandReview";
import type { CommandDisplay } from "./groupedCommand";
import { useGroupedCommand } from "./useGroupedCommand";
import { useGroupedCommandActions } from "./useGroupedCommandActions";

export default function NewCommandPage() {
  const { t, i18n } = useTranslation(["devices", "common"]);
  const can = usePermissions();
  const navigate = useNavigate();
  const { deviceId, assetId } = useParams<{
    deviceId?: string;
    assetId?: string;
  }>();
  const { devices, loading, error } = useDevicesList();
  const {
    assetTree,
    assetsList,
    isLoading,
    error: assetsError,
  } = useAssetTree();
  const command = useGroupedCommand({
    devices,
    assetTree,
    assetsList,
    deviceId,
    assetId,
    loading: loading || isLoading || !!assetsError,
  });
  const { url, selection, coverage } = command;
  const actions = useGroupedCommandActions(
    command.canSubmit
      ? { payload: command.payload, devices: selection.eligible }
      : undefined,
  );
  if (!can("devices:write") || error || assetsError)
    return <ErrorFallback title={t("common:errors.default")} />;
  if (loading || isLoading)
    return <Skeleton className="h-96 w-full rounded-lg" />;

  // Display strings stay here: nothing that goes on the wire depends on i18n.
  const display: CommandDisplay = {
    scope:
      (url.mode === "devices" && !url.locked
        ? t("commands.grouped.selectedDevices")
        : assetsList.find((asset) => asset.id === url.scope)?.name) ??
      (url.scope === "all" ? t("commands.new.allAssets") : url.scope),
    label: coverage?.label
      ? localize(coverage.label, i18n.language)
      : toLabel(url.attribute),
    unit: coverage?.unit,
    valueLabels: coverage?.value_labels,
  };

  const scopeSelect = (
    <Field className="max-w-sm">
      <FieldLabel htmlFor="command-scope">
        {t("commands.grouped.scope")}
      </FieldLabel>
      <Select
        value={url.scope}
        onValueChange={command.chooseScope}
        disabled={url.locked}
      >
        <SelectTrigger id="command-scope">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("commands.new.allAssets")}</SelectItem>
          {assetsList.map((asset) => (
            <SelectItem key={asset.id} value={asset.id}>
              {asset.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t(
          url.locked ? "commands.new.title" : "commands.new.groupedTitle",
        )}
      />
      <p className="text-sm text-muted-foreground">
        {t("commands.grouped.subtitle")}
      </p>
      {!url.scopeExists && (
        <p role="alert" className="text-destructive">
          {t("commands.grouped.scopeMissing")}
        </p>
      )}
      {command.error && (
        <p role="alert" className="text-destructive">
          {t("common:errors.default")}
        </p>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
        <fieldset disabled={!!actions.snapshot} className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <SectionNumber number={1} />
                {t("commands.grouped.who")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {url.detached && (
                <p
                  role="status"
                  className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
                >
                  {t("commands.grouped.detached")}
                </p>
              )}
              {url.locked && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LockKeyhole className="h-4 w-4" />
                  {t("commands.grouped.locked")}
                </p>
              )}
              {url.locked && scopeSelect}
              {url.locked ? (
                <ul className="max-h-80 overflow-auto divide-y rounded-lg border">
                  {selection.selected.map((device) => (
                    <li
                      key={device.id}
                      className="bg-primary/10 px-4 py-3 text-sm"
                    >
                      {device.name || device.id}
                    </li>
                  ))}
                </ul>
              ) : (
                <DevicesFilterTabs
                  devices={selection.scopeDevices}
                  resolved={selection.matched}
                  mode={url.mode}
                  onModeChange={command.chooseMode}
                  deviceIds={selection.selected.map((device) => device.id)}
                  onDeviceIdsChange={command.chooseIds}
                  typesFilter={url.types}
                  onTypesFilterChange={command.chooseTypes}
                  extraFilters={scopeSelect}
                  onFilterDeviceIdsChange={command.chooseIds}
                />
              )}
              <p className="text-xs text-muted-foreground">
                {t(
                  url.mode === "filters"
                    ? "commands.grouped.live"
                    : "commands.grouped.frozen",
                )}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <SectionNumber number={2} />
                {t("commands.grouped.what")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <GroupedCommandFields
                form={command.form}
                filter={command.selectedFilter}
                attribute={url.attribute}
                coverage={coverage}
                eligible={selection.eligible}
                hasSelection={selection.selected.length > 0}
                disabled={
                  command.isLoading ||
                  !url.scopeExists ||
                  selection.selected.length === 0
                }
                unavailable={!command.isLoading && !coverage && !!url.attribute}
                onAttributeChange={command.chooseAttribute}
                onValueChange={command.changeValue}
              />
            </CardContent>
          </Card>
        </fieldset>
        <GroupedCommandReview
          payload={command.payload}
          devices={selection.eligible}
          display={display}
          canSubmit={command.canSubmit}
          selectedCount={selection.selected.length}
          excluded={selection.excluded}
          actions={actions}
        />
      </div>
      <Button variant="ghost" onClick={() => navigate(-1)}>
        {t("common:common.cancel")}
      </Button>
    </section>
  );
}

function SectionNumber({ number }: { number: number }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-sm text-background">
      {number}
    </span>
  );
}
