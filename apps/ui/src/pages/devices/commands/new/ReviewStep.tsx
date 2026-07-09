import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatValue } from "@/lib/formatValue";
import { AttributeValue } from "@/components/AttributeValue";
import type { Device } from "@gridone/sdk";
import {
  deviceAttributes,
  type AttributeValue as AttributeValueType,
  type DeviceType,
} from "@/lib/devices";
import type { WizardFormValues } from "./types";

type ReviewStepProps = {
  values: WizardFormValues;
  selectedDevices: Device[];
};

export function ReviewStep({ values, selectedDevices }: ReviewStepProps) {
  const { t } = useTranslation("devices");

  const deviceTypes = [
    ...new Set(selectedDevices.map((d) => d.type).filter(Boolean)),
  ] as DeviceType[];

  const newValueFormatted =
    values.value !== undefined
      ? formatValue(values.value, values.attributeDataType)
      : "—";

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">
        {t("commands.new.affectedDevices", {
          count: selectedDevices.length,
        })}
      </h3>
      <div className="overflow-hidden rounded-lg border max-h-72 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>{t("commands.device")}</TableHead>
              <TableHead>{t("commands.new.valueChange")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {selectedDevices.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={2}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  {t("commands.new.noDevicesResolved")}
                </TableCell>
              </TableRow>
            ) : (
              selectedDevices.map((d) => {
                const attr = values.attribute
                  ? Object.values(deviceAttributes(d)).find(
                      (a) => a.name === values.attribute,
                    )
                  : undefined;
                const current = attr?.current_value as
                  | AttributeValueType
                  | null
                  | undefined;
                const currentFormatted =
                  current === null || current === undefined
                    ? null
                    : formatValue(current, attr?.data_type as string);
                return (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      {d.name || d.id}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2 font-mono tabular-nums">
                        {currentFormatted === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="text-muted-foreground">
                            <AttributeValue
                              deviceType={deviceTypes}
                              attributeName={(attr?.name as string) ?? ""}
                              value={currentFormatted}
                            />
                          </span>
                        )}
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-semibold">
                          <AttributeValue
                            deviceType={deviceTypes}
                            attributeName={values.attribute ?? ""}
                            value={newValueFormatted}
                          />
                        </span>
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
