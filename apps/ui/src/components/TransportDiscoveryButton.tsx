import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getDrivers, type Driver } from "@/api/drivers";
import { isApiError } from "@/api/apiError";
import { createTransportDiscovery, type Transport } from "@/api/transports";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";

type TransportDiscoveryButtonProps = {
  transport: Transport;
  className?: string;
};

export function TransportDiscoveryButton({
  transport,
  className,
}: TransportDiscoveryButtonProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [discoverySuccessful, setDiscoverySuccessful] = useState(false);

  const driversQuery = useQuery<Driver[]>({
    queryKey: ["drivers"],
    queryFn: getDrivers,
    initialData: [],
  });

  const eligibleDrivers = useMemo(() => {
    const drivers = driversQuery.data ?? [];
    const hasDiscoveryField = drivers.some(
      (driver) => typeof driver.discovery !== "undefined",
    );
    const filtered = hasDiscoveryField
      ? drivers.filter((driver) => Boolean(driver.discovery))
      : drivers;
    return filtered
      .filter((driver) => driver.transport === transport.protocol)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [driversQuery.data, transport.protocol]);

  const discoveryMutation = useMutation({
    mutationFn: (driverId: string) =>
      createTransportDiscovery(transport.id, driverId),
    onSuccess: () => {
      setDiscoverySuccessful(true);
    },
    onError: (error) => {
      const message = isApiError(error)
        ? `${t("errors.default")}: ${error.details || error.message}`
        : error instanceof Error
          ? error.message
          : t("transports.discovery.failed");
      toast.error(message);
      setIsModalOpen(false);
    },
  });

  const handleOpenModal = () => {
    if (eligibleDrivers.length === 0) {
      toast.error(t("transports.discovery.noDriver"));
      return;
    }
    setSelectedDriverId(eligibleDrivers[0]?.id ?? null);
    setDiscoverySuccessful(false);
    setIsModalOpen(true);
  };

  const handleStartDiscovery = () => {
    if (!selectedDriverId) {
      toast.error(t("transports.discovery.noDriverSelected"));
      return;
    }
    discoveryMutation.mutate(selectedDriverId);
  };

  const isDisabled = eligibleDrivers.length === 0;

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={className}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isDisabled}
                onClick={handleOpenModal}
              >
                <Search />
                {t("transports.discovery.action")}
              </Button>
            </span>
          </TooltipTrigger>
          {isDisabled && (
            <TooltipContent>
              <p>{t("transports.discovery.noDriver")}</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>

      <Dialog
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) {
            setSelectedDriverId(null);
            setDiscoverySuccessful(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {discoverySuccessful
                ? t("transports.discovery.modalTitleSuccess")
                : t("transports.discovery.modalTitle")}
            </DialogTitle>
            <DialogDescription>
              {discoverySuccessful
                ? t("transports.discovery.modalDescriptionSuccess", {
                    transportName: transport.name || transport.id,
                    driverId: selectedDriverId ?? "",
                  })
                : t("transports.discovery.modalDescription", {
                    transportName: transport.name || transport.id,
                  })}
            </DialogDescription>
          </DialogHeader>

          {!discoverySuccessful && (
            <div className="space-y-2">
              <label htmlFor="driver-select" className="text-sm font-medium">
                {t("transports.discovery.selectDriver")}
              </label>
              <Select
                value={selectedDriverId ?? undefined}
                onValueChange={setSelectedDriverId}
                disabled={discoveryMutation.isPending}
              >
                <SelectTrigger id="driver-select">
                  <SelectValue
                    placeholder={t("transports.discovery.selectDriverPlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {eligibleDrivers.map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      {driver.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            {discoverySuccessful ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                >
                  {t("transports.discovery.stay")}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    navigate("/devices");
                  }}
                >
                  {t("transports.discovery.viewDevices")}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  disabled={discoveryMutation.isPending}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="button"
                  onClick={handleStartDiscovery}
                  disabled={!selectedDriverId || discoveryMutation.isPending}
                >
                  {discoveryMutation.isPending ? (
                    <>
                      <Loader2 className="animate-spin" />
                      {t("transports.discovery.inProgress")}
                    </>
                  ) : (
                    t("transports.discovery.start")
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
