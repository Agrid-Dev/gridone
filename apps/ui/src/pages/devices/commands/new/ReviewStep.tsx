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
import type { Device } from "@/api/devices";
import type { WizardFormValues } from "./types";

type ReviewStepProps = {
  values: WizardFormValues;
  selectedDevices: Device[];
};

export function ReviewStep({ values, selectedDevices }: ReviewStepProps) {
  const { t } = useTranslation("devices");

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
                  ? Object.values(d.attributes).find(
                      (a) => a.name === values.attribute,
                    )
                  : undefined;
                const current = attr?.currentValue;
                const currentFormatted =
                  current === null || current === undefined
                    ? null
                    : formatValue(current, attr?.dataType);
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
                            {currentFormatted}
                          </span>
                        )}
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-semibold">
                          {newValueFormatted}
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
