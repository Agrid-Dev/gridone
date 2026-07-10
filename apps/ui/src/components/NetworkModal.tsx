import { FC } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import TransportForm from "@/pages/transports/form";
import type { FormProtocol } from "@/pages/transports/form/useTransportForm";
import type { Transport } from "@gridone/sdk";
import { useDevicesList } from "@/hooks/useDevicesList";

export type NetworkModalProps = {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  protocol?: FormProtocol;
  transport?: Transport;
  onSubmitted: (transport: Transport) => void;
};

export const NetworkModal: FC<NetworkModalProps> = ({
  open,
  onClose,
  mode,
  protocol,
  transport,
  onSubmitted,
}) => {
  const { t } = useTranslation(["transports", "common"]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? t("createTitle") : t("editTitle")}
          </DialogTitle>
          <DialogDescription>
            {mode === "create" ? t("createSubtitle") : t("editSubtitle")}
          </DialogDescription>
        </DialogHeader>

        {mode === "edit" && transport && (
          <LinkedDevicesWarning transportId={transport.id} />
        )}

        {open && (
          <TransportForm
            transport={mode === "edit" ? transport : undefined}
            lockedProtocol={mode === "create" ? protocol : undefined}
            onCreated={(t) => {
              onSubmitted(t);
              onClose();
            }}
            onUpdated={(t) => {
              onSubmitted(t);
              onClose();
            }}
            onCancel={onClose}
            formId="network-modal-form"
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

const LinkedDevicesWarning: FC<{ transportId: string }> = ({ transportId }) => {
  const { t } = useTranslation("transports");
  const { devices } = useDevicesList();
  const count = devices.filter((d) => d.transport_id === transportId).length;
  if (count === 0) return null;
  return (
    <Alert>
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>
        {t("linkedDevicesWarning", { count })}
      </AlertDescription>
    </Alert>
  );
};

export default NetworkModal;
