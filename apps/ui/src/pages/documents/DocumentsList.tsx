import { useTranslation } from "react-i18next";
import { Plus, Search, X } from "lucide-react";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { DocumentRows } from "./DocumentRows";
import { useDocumentChoices, useDocumentFilters } from "./useDocuments";

export default function DocumentsList() {
  const { t } = useTranslation("documents");
  const can = usePermissions();
  const { params, setFilter, clear } = useDocumentFilters();
  const choices = useDocumentChoices();
  const hasFilters = !!(params.q || params.asset_id || params.device_id);

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("title")}
        caption={t("caption")}
        actions={
          can("documents:write") && (
            <Button asChild>
              <Link to="/documents/new">
                <Plus />
                {t("add")}
              </Link>
            </Button>
          )
        }
      />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-80">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
            />
            <Input
              type="search"
              className="h-9 pl-9"
              aria-label={t("search")}
              placeholder={t("search")}
              value={params.q ?? ""}
              onChange={(event) => setFilter("q", event.target.value)}
            />
          </div>
          {(["asset_id", "device_id"] as const).map((key) => (
            <Select
              key={key}
              value={params[key] ?? "all"}
              onValueChange={(value) =>
                setFilter(key, value === "all" ? "" : value)
              }
            >
              <SelectTrigger
                aria-label={t(key === "asset_id" ? "assets" : "devices")}
                className={cn(
                  "h-9 w-full sm:w-48",
                  params[key] && "border-primary text-primary",
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t(key === "asset_id" ? "allAssets" : "allDevices")}
                </SelectItem>
                {(key === "asset_id" ? choices.assets : choices.devices).map(
                  (item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          ))}
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clear}>
              <X aria-hidden />
              {t("clearFilters")}
            </Button>
          )}
        </div>
        <DocumentRows
          params={params}
          onPage={(page) => setFilter("page", String(page))}
          clear={clear}
        />
      </div>
    </section>
  );
}
