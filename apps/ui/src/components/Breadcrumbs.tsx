import { Fragment } from "react";
import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { OrgAvatar } from "@/components/OrgAvatar";
import {
  isProfileConfigured,
  useBuildingProfile,
} from "@/hooks/useBuildingProfile";
import { pathnameToSegments, type BreadcrumbSegment } from "@/lib/breadcrumbs";
import { getDevice, type Device } from "@/api/devices";
import { getTemplate, type CommandTemplate } from "@/api/commands";
import {
  flattenAssetTreeById,
  getAssetTreeWithDevices,
  type AssetTreeNode,
} from "@/api/assets";

const ENTITY_STALE = 5 * 60 * 1000;

/** Resolves the display name for the (at most one) entity segment in a trail,
 *  reusing the same query keys the detail pages populate so we share their
 *  cache rather than double-fetching. Each query is gated to the kind in play,
 *  so a device page never fetches the asset tree, etc. Returns `undefined`
 *  until the name hydrates — callers fall back to the id so the trail is never
 *  empty. */
function useEntityName(
  entity?: BreadcrumbSegment["entity"],
): string | undefined {
  const queryClient = useQueryClient();
  const deviceId = entity?.kind === "device" ? entity.id : undefined;
  const templateId = entity?.kind === "template" ? entity.id : undefined;
  const assetId = entity?.kind === "asset" ? entity.id : undefined;

  const device = useQuery<Device>({
    queryKey: ["device", deviceId],
    queryFn: () => getDevice(deviceId as string),
    enabled: !!deviceId,
    staleTime: ENTITY_STALE,
    // Seed from any cached `["devices", filter]` list so the name shows
    // instantly when navigating from the list.
    initialData: () => {
      if (!deviceId) return undefined;
      for (const [, devices] of queryClient.getQueriesData<Device[]>({
        queryKey: ["devices"],
      })) {
        const cached = devices?.find((d) => d.id === deviceId);
        if (cached) return cached;
      }
      return undefined;
    },
  });

  const template = useQuery<CommandTemplate>({
    queryKey: ["command-templates", templateId],
    queryFn: () => getTemplate(templateId as string),
    enabled: !!templateId,
    staleTime: ENTITY_STALE,
  });

  const assetTree = useQuery<AssetTreeNode[]>({
    queryKey: ["assets", "tree-with-devices"],
    queryFn: getAssetTreeWithDevices,
    enabled: !!assetId,
    staleTime: ENTITY_STALE,
  });

  if (deviceId) return device.data?.name || undefined;
  if (templateId) return template.data?.name || undefined;
  if (assetId) {
    return flattenAssetTreeById(assetTree.data ?? [])[assetId]?.name || undefined; // prettier-ignore
  }
  return undefined;
}

function segmentLabel(
  segment: BreadcrumbSegment,
  t: TFunction<"common">,
  entityName: string | undefined,
): string {
  // Keys are produced by the pure path matcher, so they are dynamic strings
  // from `t`'s perspective; cast to satisfy the typed key union.
  if (segment.labelKey) return t(segment.labelKey as never);
  if (segment.entity) return entityName ?? segment.entity.id;
  return segment.rawLabel ?? "";
}

export function Breadcrumbs() {
  const { t } = useTranslation("common");
  const { pathname } = useLocation();
  const { data: profile } = useBuildingProfile();
  const configured = isProfileConfigured(profile);

  const segments = pathnameToSegments(pathname);
  const entitySegment = segments.find((s) => s.entity);
  const entityName = useEntityName(entitySegment?.entity);

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link
              to={configured ? "/" : "/devices"}
              className="inline-flex min-w-0 items-center gap-2"
            >
              <OrgAvatar
                icon={profile?.icon}
                name={profile?.name}
                className="h-7 w-7"
              />
              {configured && (
                <span className="truncate font-sans text-base font-semibold tracking-tight text-foreground">
                  {profile?.name}
                </span>
              )}
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>

        {segments.map((segment) => {
          const label = segmentLabel(segment, t, entityName);
          return (
            <Fragment key={segment.key}>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                {segment.isCurrent ? (
                  <BreadcrumbPage className="truncate">{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={segment.href} className="truncate">
                      {label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
