import { useMemo, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  Building2,
  ChevronRight,
  CornerDownRight,
  Cpu,
  DoorOpen,
  Layers3,
  LayoutGrid,
  Link2,
  Move,
  Pencil,
  Plus,
} from "lucide-react";
import type { Asset, Device } from "@gridone/sdk";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InputController } from "@/components/forms/controllers/InputController";
import { SelectController } from "@/components/forms/controllers/SelectController";
import { ConnectionStatusDot } from "@/components/ConnectionStatusBadge";
import { ResourceDeleteButton } from "@/components/ResourceDeleteButton";
import { getConnectionStatus } from "@/lib/devices";
import { deviceTypeIcon } from "@/lib/deviceTypes";
import { formatTimeAgo } from "@/lib/utils";
import { sortedByName } from "@/lib/sortByName";
import { ASSET_TYPES } from "@/lib/assets";
import { assetFormSchema, type AssetFormValues } from "./AssetForm";
import { BuildingModelCard } from "./BuildingModelCard";
import { SpaceLinkCard } from "./SpaceLinkCard";
import { EmptySection, SectionHeading } from "./workspaceSections";

type AssetEditWorkspaceProps = {
  mode?: "detail" | "edit";
  asset: Asset;
  allAssets: Asset[];
  childAssets: Asset[];
  devices: Device[];
  deviceIds: string[];
  isPending?: boolean;
  isDeleting?: boolean;
  canWriteAssets: boolean;
  canWriteDevices: boolean;
  headerActions?: ReactNode;
  onSubmit?: (data: AssetFormValues) => void;
  onDelete?: () => void;
  onLinkDevice: () => void;
};

/** The Save button lives in the page header, outside the form it commits. */
const FORM_ID = "asset-workspace-form";

const assetTypeIcons = {
  org: LayoutGrid,
  building: Building2,
  floor: Layers3,
  room: DoorOpen,
  zone: LayoutGrid,
} as const;

/** Screenshot-inspired zone workspace shared by detail and edit routes. */
export function AssetEditWorkspace({
  mode = "edit",
  asset,
  allAssets,
  childAssets,
  devices,
  deviceIds,
  isPending = false,
  isDeleting = false,
  canWriteAssets,
  canWriteDevices,
  headerActions,
  onSubmit,
  onDelete,
  onLinkDevice,
}: AssetEditWorkspaceProps) {
  const { t } = useTranslation(["assets", "common"]);
  const { t: tCommon } = useTranslation("common");

  const form = useForm<AssetFormValues>({
    resolver: zodResolver(assetFormSchema),
    defaultValues: {
      name: asset.name,
      type: asset.type,
      parentId: asset.parent_id ?? "",
    },
  });

  const assetsById = useMemo(
    () => new Map(allAssets.map((item) => [item.id, item])),
    [allAssets],
  );

  const ancestors = useMemo(
    () =>
      (asset.path ?? [])
        .filter((id) => id !== asset.id)
        .map((id) => assetsById.get(id))
        .filter((item): item is Asset => Boolean(item) && item?.type !== "org"),
    [asset.id, asset.path, assetsById],
  );

  const parentOptions = useMemo(
    () =>
      sortedByName(
        allAssets.filter(
          (item) =>
            item.id !== asset.id && !(item.path ?? []).includes(asset.id),
        ),
      ).map((item) => ({
        value: item.id,
        label: `${item.name} · ${t(`types.${item.type}`)}`,
      })),
    [allAssets, asset.id, t],
  );

  const typeOptions = ASSET_TYPES.map((type) => ({
    value: type,
    label: t(`types.${type}`),
  }));

  const linkedDevices = useMemo(() => {
    const linked = new Set(deviceIds);
    return sortedByName(devices.filter((device) => linked.has(device.id)));
  }, [deviceIds, devices]);

  const updatedAt = asset.updated_at
    ? formatTimeAgo(new Date(asset.updated_at).getTime(), tCommon)
    : null;
  const AssetIcon = assetTypeIcons[asset.type];
  const isEditing = mode === "edit";
  const fieldsDisabled = !isEditing || !canWriteAssets;

  return (
    <section className="space-y-7">
      <nav
        aria-label={t("editPage.breadcrumbLabel")}
        className="flex min-w-0 items-center gap-1 overflow-hidden text-sm text-muted-foreground"
      >
        <Link to="/assets" className="shrink-0 hover:text-foreground">
          {t("title")}
        </Link>
        {[...ancestors, asset].map((item, index) => (
          <span key={item.id} className="contents">
            <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />
            {index === ancestors.length ? (
              <span className="truncate font-medium text-foreground">
                {item.name}
              </span>
            ) : (
              <Link
                to={`/assets/${item.id}`}
                className="shrink-0 hover:text-foreground"
              >
                {item.name}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <header className="flex flex-col gap-5 border-b border-border pb-7 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/10">
            <AssetIcon className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0 pt-0.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate font-display text-3xl font-semibold tracking-tight text-foreground">
                {asset.name}
              </h1>
              <Badge variant="info" className="px-3 py-1 text-sm">
                {t(`types.${asset.type}`)}
              </Badge>
              <Badge
                variant="outline"
                className="gap-1.5 px-3 py-1 text-sm font-medium"
              >
                <CornerDownRight className="h-3.5 w-3.5" />
                {t("overview.subzoneCount", { count: childAssets.length })}
              </Badge>
              <Badge
                variant="outline"
                className="gap-1.5 px-3 py-1 text-sm font-medium"
              >
                <Cpu className="h-3.5 w-3.5" />
                {t("overview.deviceCount", { count: deviceIds.length })}
              </Badge>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {updatedAt
                ? t("editPage.lastModified", { time: updatedAt })
                : t(
                    isEditing
                      ? "editPage.editingHint"
                      : "editPage.overviewHint",
                  )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          {isEditing ? (
            // Same destination as the old "Supervise" button, named for what
            // it does while editing: leave without saving.
            <Button variant="outline" asChild className="h-11">
              <Link to={`/assets/${asset.id}`}>
                {t("common:common.cancel")}
              </Link>
            </Button>
          ) : (
            canWriteAssets && (
              <Button variant="outline" asChild className="h-11">
                <Link to={`/assets/${asset.id}/edit`}>
                  <Pencil />
                  {t("common:common.update")}
                </Link>
              </Button>
            )
          )}
          {headerActions}
          {/* The primary slot carries the page's main action: committing the
              form while editing, adding a sub-zone while supervising. */}
          {isEditing
            ? canWriteAssets && (
                <Button
                  type="submit"
                  form={FORM_ID}
                  className="h-11"
                  disabled={isPending}
                >
                  {isPending
                    ? t("common:common.saving")
                    : t("editPage.saveChanges")}
                </Button>
              )
            : canWriteAssets && (
                <Button asChild className="h-11">
                  <Link to={`/assets/new?parentId=${asset.id}&type=zone`}>
                    <Plus />
                    {t("editPage.addSubzone")}
                  </Link>
                </Button>
              )}
          {isEditing && canWriteAssets && onDelete && (
            <ResourceDeleteButton
              onDelete={onDelete}
              isDeleting={isDeleting}
              confirmTitle={t("deleteConfirmTitle")}
              confirmDetails={t("deleteConfirmDetails", {
                name: asset.name,
              })}
            />
          )}
        </div>
      </header>

      <form
        id={FORM_ID}
        onSubmit={form.handleSubmit((data) => onSubmit?.(data))}
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.9fr)]">
          <Card className="flex flex-col self-start rounded-2xl p-6 shadow-sm sm:p-7">
            <SectionHeading
              title={t("editPage.identity.title")}
              description={t("editPage.identity.description")}
            />

            <div className="mt-6 space-y-5">
              <InputController
                name="name"
                control={form.control}
                label={t("fields.name")}
                required
                disabled={fieldsDisabled}
                inputProps={{ className: "h-11 bg-muted/15" }}
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <SelectController
                  name="type"
                  control={form.control}
                  label={t("fields.type")}
                  options={typeOptions}
                  required
                  disabled={fieldsDisabled}
                  triggerProps={{ className: "h-11 bg-muted/15" }}
                />
                <div className="space-y-2">
                  <div className="text-sm font-medium text-foreground">
                    {t("editPage.identity.identifier")}
                  </div>
                  <div className="flex h-11 items-center rounded-md border border-input bg-muted/35 px-3 font-mono text-sm text-muted-foreground">
                    {asset.id}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="flex h-full flex-col rounded-2xl p-6 shadow-sm sm:p-7">
            <SectionHeading
              title={t("editPage.location.title")}
              description={t("editPage.location.description")}
            />

            <div className="mt-6 space-y-1">
              {ancestors.map((item, index) => {
                const Icon = assetTypeIcons[item.type];
                return (
                  <Link
                    key={item.id}
                    to={`/assets/${item.id}`}
                    className="flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
                    style={{ paddingLeft: `${12 + index * 20}px` }}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{item.name}</span>
                  </Link>
                );
              })}
              <div
                className="flex min-h-11 items-center gap-3 rounded-xl bg-primary/10 px-3 text-sm font-semibold text-primary"
                style={{ paddingLeft: `${12 + ancestors.length * 20}px` }}
              >
                <CornerDownRight className="h-4 w-4 shrink-0" />
                <span className="truncate">{asset.name}</span>
              </div>
              {sortedByName(childAssets).map((child) => (
                <Link
                  key={child.id}
                  to={`/assets/${child.id}`}
                  className="flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  style={{ paddingLeft: `${32 + ancestors.length * 20}px` }}
                >
                  <CornerDownRight className="h-4 w-4 shrink-0 opacity-60" />
                  <span className="truncate">{child.name}</span>
                </Link>
              ))}
            </div>

            <div className="mt-6 border-t border-border pt-5">
              {isEditing ? (
                <SelectController
                  name="parentId"
                  control={form.control}
                  label={t("fields.parent")}
                  description={t("editPage.location.moveHint")}
                  options={parentOptions}
                  placeholder={t("fields.parentPlaceholder")}
                  required
                  disabled={!canWriteAssets}
                  triggerProps={{ className: "h-11 bg-muted/15" }}
                />
              ) : (
                canWriteAssets && (
                  <Button variant="outline" asChild>
                    <Link to={`/assets/${asset.id}/edit`}>
                      <Move />
                      {t("editPage.location.move")}
                    </Link>
                  </Button>
                )
              )}
            </div>
          </Card>

          <Card className="flex h-full flex-col rounded-2xl p-6 shadow-sm sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <SectionHeading
                title={t("editPage.subzones.title")}
                description={t("editPage.subzones.description")}
              />
              {canWriteAssets && (
                <Button variant="outline" asChild className="shrink-0">
                  <Link to={`/assets/new?parentId=${asset.id}&type=zone`}>
                    <Plus />
                    {t("editPage.add")}
                  </Link>
                </Button>
              )}
            </div>

            <div className="mt-6">
              {childAssets.length > 0 ? (
                <ul className="divide-y divide-border">
                  {sortedByName(childAssets).map((child) => (
                    <li key={child.id}>
                      <Link
                        to={`/assets/${child.id}`}
                        className="group flex items-center gap-3 rounded-lg px-2 py-3.5 transition-colors hover:bg-muted/50"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <CornerDownRight className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {child.name}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {t(`types.${child.type}`)}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptySection>{t("noChildren")}</EmptySection>
              )}
            </div>
          </Card>

          <Card className="flex h-full flex-col rounded-2xl p-6 shadow-sm sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <SectionHeading
                title={t("editPage.devices.title")}
                description={t("editPage.devices.description")}
              />
              {canWriteDevices && (
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={onLinkDevice}
                >
                  <Link2 />
                  {t("devices.link")}
                </Button>
              )}
            </div>

            <div className="mt-6">
              {linkedDevices.length > 0 ? (
                <ul className="space-y-1">
                  {linkedDevices.map((device) => {
                    const DeviceIcon = deviceTypeIcon(device.type) ?? Cpu;
                    return (
                      <li key={device.id}>
                        <Link
                          to={`/devices/${device.id}`}
                          className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/50"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <DeviceIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {device.name || device.id}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {device.type
                                ? t(
                                    `common:common.deviceTypes.${device.type}`,
                                    { defaultValue: device.type },
                                  )
                                : t("common:common.unknown")}
                            </p>
                          </div>
                          <ConnectionStatusDot
                            status={getConnectionStatus(device)}
                            className="shrink-0"
                          />
                          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptySection>{t("devices.noDevices")}</EmptySection>
              )}
            </div>
          </Card>

          {asset.type === "building" && (
            <BuildingModelCard assetId={asset.id} canWrite={canWriteAssets} />
          )}

          {asset.type === "room" && (
            <SpaceLinkCard
              asset={asset}
              allAssets={allAssets}
              canWrite={canWriteAssets}
            />
          )}
        </div>
      </form>
    </section>
  );
}
