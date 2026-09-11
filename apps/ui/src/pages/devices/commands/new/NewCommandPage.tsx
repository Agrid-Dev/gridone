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
import { deviceAttributes } from "@/lib/devices";
import { GroupedCommandFields } from "./GroupedCommandFields";
import { GroupedCommandReview } from "./GroupedCommandReview";
import { useGroupedCommand } from "./useGroupedCommand";
import { useGroupedCommandActions } from "./useGroupedCommandActions";

export default function NewCommandPage() {
  const { t } = useTranslation(["devices", "common"]);
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
  const actions = useGroupedCommandActions(
    command.canSubmit ? command.preview : undefined,
  );
  if (!can("devices:write") || error || assetsError)
    return <ErrorFallback title={t("common:errors.default")} />;
  if (loading || isLoading)
    return <Skeleton className="h-96 w-full rounded-lg" />;

  return (
    <section className="space-y-6">
      <ResourceHeader title={t("commands.new.title")} />
      <p className="text-sm text-muted-foreground">
        {t("commands.grouped.subtitle")}
      </p>
      <fieldset disabled={!!actions.snapshot} className="min-w-0">
        <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/20 p-4">
          <Field className="max-w-sm">
            <FieldLabel htmlFor="command-scope">
              {t("commands.grouped.scope")}
            </FieldLabel>
            <Select
              value={command.scope}
              onValueChange={command.chooseScope}
              disabled={command.locked}
            >
              <SelectTrigger id="command-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("commands.new.allAssets")}
                </SelectItem>
                {assetsList.map((asset) => (
                  <SelectItem key={asset.id} value={asset.id}>
                    {asset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">
            {t("commands.grouped.scopeHint")}
          </p>
        </div>
      </fieldset>
      {!command.scopeExists && (
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
                {t("commands.grouped.what")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <GroupedCommandFields command={command} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <SectionNumber number={2} />
                {t("commands.grouped.who")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {command.detached && (
                <p
                  role="status"
                  className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
                >
                  {t("commands.grouped.detached")}
                </p>
              )}
              {command.locked && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LockKeyhole className="h-4 w-4" />
                  {t("commands.grouped.locked")}
                </p>
              )}
              {!command.attribute ? (
                <p className="text-sm text-muted-foreground">
                  {t("commands.grouped.pickAttribute")}
                </p>
              ) : command.locked ? (
                <ul className="max-h-80 overflow-auto divide-y rounded-lg border">
                  {command.selected.map((device) => (
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
                  devices={command.eligible}
                  mode={command.mode}
                  onModeChange={command.chooseMode}
                  deviceIds={command.selected.map((device) => device.id)}
                  onDeviceIdsChange={command.chooseIds}
                  typesFilter={command.types}
                  onTypesFilterChange={command.chooseTypes}
                  extraDeviceFilter={() => true}
                  onFilterDeviceIdsChange={command.chooseIds}
                />
              )}
              {command.attribute && (
                <p className="text-xs text-muted-foreground">
                  {t(
                    command.mode === "filters"
                      ? "commands.grouped.live"
                      : "commands.grouped.frozen",
                  )}
                </p>
              )}
              {command.excluded.length > 0 && (
                <details className="rounded-lg border p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    {t("commands.grouped.excluded", {
                      count: command.excluded.length,
                    })}
                  </summary>
                  <ul className="mt-3 space-y-2">
                    {command.excluded.map((device) => (
                      <li
                        key={device.id}
                        className="flex justify-between gap-3 text-sm"
                      >
                        <span>{device.name || device.id}</span>
                        <span className="text-muted-foreground">
                          {t(
                            deviceAttributes(device)[command.attribute]
                              ? "commands.grouped.readOnly"
                              : "commands.grouped.absent",
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>
        </fieldset>
        <GroupedCommandReview
          preview={command.preview}
          canSubmit={command.canSubmit}
          eligibleCount={command.eligible.length}
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
