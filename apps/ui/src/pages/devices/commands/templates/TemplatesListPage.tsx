import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { listTemplates, type CommandTemplate } from "@/api/commands";
import {
  getAssetTreeWithDevices,
  type AssetTreeNode,
  type Asset,
} from "@/api/assets";
import { usePermissions } from "@/contexts/AuthContext";
import { toSearchString } from "@/api/pagination";
import { TargetPresenter } from "../presenters/TargetPresenter";
import { WritePresenter } from "../presenters/WritePresenter";

export default function TemplatesListPage() {
  const { t } = useTranslation("devices");
  const can = usePermissions();
  const [searchParams] = useSearchParams();

  const query = useQuery({
    queryKey: ["command-templates", searchParams.toString()],
    queryFn: () => listTemplates(searchParams),
  });

  const { data: assetTree = [] } = useQuery<AssetTreeNode[]>({
    queryKey: ["assets", "tree-with-devices"],
    queryFn: getAssetTreeWithDevices,
  });

  const assetsById = useMemo(() => flattenAssets(assetTree), [assetTree]);

  const header = (
    <ResourceHeader
      resourceName={t("commands.title")}
      title={t("commands.templates.title")}
      resourceNameLinksBack
      backTo="/devices/commands"
      actions={
        can("devices:write") && (
          <Button asChild size="sm">
            <Link to="/devices/commands/new">
              <Plus />
              {t("commands.newCommand")}
            </Link>
          </Button>
        )
      }
    />
  );

  if (query.isLoading) {
    return (
      <section className="space-y-6">
        {header}
        <Skeleton className="h-64 w-full rounded-lg" />
      </section>
    );
  }
  if (query.isError) {
    return (
      <section className="space-y-6">
        {header}
        <ErrorFallback title={t("common:errors.default")} />
      </section>
    );
  }

  const templates = query.data?.items ?? [];
  const prevHref = toSearchString(query.data?.links?.prev ?? null);
  const nextHref = toSearchString(query.data?.links?.next ?? null);

  return (
    <section className="space-y-6">
      {header}
      {templates.length === 0 ? (
        <ResourceEmpty
          resourceName={t("commands.templates.resource")}
          showCreate={can("devices:write")}
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead>{t("commands.templates.name")}</TableHead>
                  <TableHead>{t("commands.templates.target")}</TableHead>
                  <TableHead>{t("commands.templates.payload")}</TableHead>
                  <TableHead>{t("commands.templates.createdBy")}</TableHead>
                  <TableHead>{t("commands.templates.createdAt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((tpl) => (
                  <TemplateRow
                    key={tpl.id}
                    template={tpl}
                    assetsById={assetsById}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          {(prevHref || nextHref) && (
            <div className="flex items-center justify-end gap-1">
              {prevHref ? (
                <Link
                  to={{ search: prevHref }}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "icon" }),
                    "h-8 w-8",
                  )}
                  replace
                >
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              ) : (
                <span
                  className={cn(
                    buttonVariants({ variant: "outline", size: "icon" }),
                    "h-8 w-8 pointer-events-none opacity-50",
                  )}
                >
                  <ChevronLeft className="h-4 w-4" />
                </span>
              )}
              {nextHref ? (
                <Link
                  to={{ search: nextHref }}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "icon" }),
                    "h-8 w-8",
                  )}
                  replace
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <span
                  className={cn(
                    buttonVariants({ variant: "outline", size: "icon" }),
                    "h-8 w-8 pointer-events-none opacity-50",
                  )}
                >
                  <ChevronRight className="h-4 w-4" />
                </span>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function TemplateRow({
  template,
  assetsById,
}: {
  template: CommandTemplate;
  assetsById: Record<string, Asset>;
}) {
  return (
    <TableRow className="cursor-pointer">
      <TableCell className="font-medium">
        <Link
          to={`/devices/commands/templates/${template.id}`}
          className="hover:underline"
        >
          {template.name}
        </Link>
      </TableCell>
      <TableCell>
        <TargetPresenter target={template.target} assetsById={assetsById} />
      </TableCell>
      <TableCell>
        <WritePresenter write={template.write} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {template.createdBy}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {new Date(template.createdAt).toLocaleString()}
      </TableCell>
    </TableRow>
  );
}

function flattenAssets(tree: AssetTreeNode[]): Record<string, Asset> {
  const out: Record<string, Asset> = {};
  const walk = (nodes: AssetTreeNode[]) => {
    for (const n of nodes) {
      out[n.id] = {
        id: n.id,
        parentId: n.parentId,
        type: n.type,
        name: n.name,
        path: n.path,
        position: n.position,
      };
      walk(n.children);
    }
  };
  walk(tree);
  return out;
}
