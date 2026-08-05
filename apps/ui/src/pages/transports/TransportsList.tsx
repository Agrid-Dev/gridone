import { type FC, type ReactNode, useMemo } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { usePermissions } from "@/contexts/AuthContext";
import { useDevicesList } from "@/hooks/useDevicesList";
import { sortedByName } from "@/lib/sortByName";
import { TransportsTable } from "./TransportsTable";
import { summarizeTransportDevices } from "./transportPresentation";
import { useTransports } from "./useTransports";

const TransportsListContainer: FC<{ children: ReactNode }> = ({ children }) => {
  const { t } = useTranslation("transports");
  const can = usePermissions();

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("title")}
        caption={t("caption")}
        actions={
          can("transports:write") ? (
            <Button asChild>
              <Link to="new">
                <Plus />
                {t("createAction")}
              </Link>
            </Button>
          ) : undefined
        }
      />
      {children}
    </section>
  );
};

const TransportsList: FC = () => {
  const { t } = useTranslation("transports");
  const { transportsListQuery } = useTransports();
  const { devices, loading: devicesLoading } = useDevicesList();

  const transports = useMemo(
    () => sortedByName(transportsListQuery.data),
    [transportsListQuery.data],
  );
  const deviceSummaries = useMemo(
    () => summarizeTransportDevices(devices),
    [devices],
  );

  if (transportsListQuery.isLoading || devicesLoading) {
    return (
      <TransportsListContainer>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14" />
          ))}
        </div>
      </TransportsListContainer>
    );
  }

  return (
    <TransportsListContainer>
      {transportsListQuery.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {t("unableToLoad")}
        </div>
      ) : transports.length > 0 ? (
        <TransportsTable
          transports={transports}
          deviceSummaries={deviceSummaries}
        />
      ) : (
        <ResourceEmpty
          resourceName="network"
          showCreate={false}
          title={t("empty")}
        />
      )}
    </TransportsListContainer>
  );
};

export default TransportsList;
