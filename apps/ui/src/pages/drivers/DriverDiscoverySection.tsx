import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import type { Driver } from "@gridone/sdk";
import { Card, CardContent } from "@/components/ui";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH3, TypographySmall } from "@/components/ui/typography";
import { usePermissions } from "@/contexts/AuthContext";
import { useDriverDiscovery } from "./useDriverDiscovery";

/** One switch per network speaking the driver's protocol: on means the
 *  driver's discovery handler is registered on that network. */
export const DriverDiscoverySection: FC<{ driver: Driver }> = ({ driver }) => {
  const { t } = useTranslation("drivers");
  const can = usePermissions();
  const { transports, setEnabled, loading, error } = useDriverDiscovery(driver);
  const readOnly = !can("transports:write");

  return (
    <Card className="py-4">
      <CardContent>
        <TypographyH3>{t("discoverySection.title")}</TypographyH3>
        <TypographySmall>{t("discoverySection.description")}</TypographySmall>
        <div className="mt-4">
          {loading ? (
            <Skeleton className="h-12" />
          ) : error ? (
            <p className="text-sm text-muted-foreground">
              {t("discoverySection.error")}
            </p>
          ) : transports.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("discoverySection.empty")}
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {transports.map(({ transport, enabled, loading: busy }) => (
                <li
                  key={transport.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <span className="text-sm font-medium text-foreground">
                    {transport.name}
                  </span>
                  <span className="flex items-center gap-2">
                    {busy && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    <Switch
                      aria-label={transport.name}
                      checked={enabled}
                      onCheckedChange={(next) => setEnabled(transport.id, next)}
                      disabled={readOnly || busy}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
