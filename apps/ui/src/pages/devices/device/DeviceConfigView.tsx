import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { FieldSet, FieldLegend } from "@/components/ui/field";
import { ConfirmButton } from "@/components/ConfirmButton";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import { useDeleteDevice } from "@/hooks/useDeleteDevice";
import { useBreadcrumb } from "@/components/BreadcrumbProvider";
import { usePermissions } from "@/contexts/AuthContext";
import { useTransports } from "@/pages/transports/useTransports";
import { toLabel } from "@/lib/textFormat";

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 md:grid-cols-[12rem_1fr]">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

/** Read-only device configuration card: mirrors the device form split into
 *  Identity / Driver & network / Configuration sections, with Edit and Delete
 *  actions. The editable form lives one level down at `config/edit`. */
export default function DeviceConfigView() {
  const { t } = useTranslation(["devices", "common"]);
  const navigate = useNavigate();
  const device = useDeviceFromRoute();
  const can = usePermissions();
  const { handleDelete, isDeleting } = useDeleteDevice();
  const { transportsListQuery } = useTransports();

  useBreadcrumb([
    { to: `/devices/${device.id}/config`, labelKey: "breadcrumb.config" },
  ]);

  const transport = transportsListQuery.data?.find(
    (item) => item.id === device.transport_id,
  );
  const transportLabel = transport?.name ?? device.transport_id;
  const configEntries = Object.entries(device.config);

  return (
    <Card>
      <CardContent className="my-8 grid gap-8">
        <FieldSet>
          <FieldLegend>{t("devices.sections.identity")}</FieldLegend>
          <Row label={t("devices.fields.name")} value={device.name} />
        </FieldSet>

        <FieldSet>
          <FieldLegend>{t("devices.sections.driverNetwork")}</FieldLegend>
          <Row
            label={t("devices.fields.driver")}
            value={
              <Link
                to={`/drivers/${device.driver_id}`}
                className="text-primary hover:underline"
              >
                {device.driver_id}
              </Link>
            }
          />
          <Row
            label={t("devices.fields.transport")}
            value={
              <Link
                to={`/transports/${device.transport_id}`}
                className="text-primary hover:underline"
              >
                {transportLabel}
              </Link>
            }
          />
        </FieldSet>

        <FieldSet>
          <FieldLegend>{t("devices.sections.configuration")}</FieldLegend>
          {configEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("common:common.noConfiguration")}
            </p>
          ) : (
            configEntries.map(([key, value]) => (
              <Row key={key} label={toLabel(key)} value={String(value)} />
            ))
          )}
        </FieldSet>
      </CardContent>

      {can("devices:write") && (
        <CardFooter className="flex justify-end gap-3">
          <ConfirmButton
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={isDeleting}
            onConfirm={() => handleDelete(device.id)}
            confirmTitle={t("devices.actions.deleteDialogTitle")}
            confirmDetails={t("devices.actions.deleteDialogContent", {
              name: device.name || device.id,
            })}
            confirmLabel={t("devices.actions.delete")}
          >
            <Trash2 className="h-4 w-4" />
            {t("devices.actions.delete")}
          </ConfirmButton>
          <Button type="button" onClick={() => navigate("edit")}>
            <Pencil className="h-4 w-4" />
            {t("devices.actions.edit")}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
