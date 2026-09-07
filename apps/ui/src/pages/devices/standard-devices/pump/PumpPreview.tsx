import { useTranslation } from "react-i18next";
import { isPump, readPumpAttributes } from "@/lib/devices";
import { attributeUnit } from "@/lib/attributeUnits";
import { fmt } from "@/lib/formatValue";
import { PumpGlyph } from "./PumpGlyph";
import { pumpState } from "./state";
import type { PumpFieldKey, PumpValues } from "./types";
import type { StandardPreviewProps } from "../types";

/** The one reading worth a card slot, first present wins: what the pump
 *  delivers, else how fast it turns, else what it draws. */
const LEAD: {
  key: keyof PumpValues;
  attribute: PumpFieldKey;
  digits: number;
}[] = [
  { key: "volumeFlow", attribute: "volume_flow", digits: 1 },
  { key: "head", attribute: "head", digits: 1 },
  { key: "speed", attribute: "speed", digits: 0 },
  { key: "power", attribute: "power", digits: 0 },
];

export function PumpPreview({ device }: StandardPreviewProps) {
  const { t } = useTranslation("standardDevices");
  if (!isPump(device)) return null;

  const values = readPumpAttributes(device);
  const state = pumpState(values);
  const lead = LEAD.find((candidate) => values[candidate.key] != null);
  const unit = lead ? attributeUnit(lead.attribute) : null;

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <svg viewBox="0 0 120 120" className="h-8 w-8 shrink-0" aria-hidden>
          <PumpGlyph
            cx={60}
            cy={74}
            r={38}
            state={state}
            spinning={state === "running"}
            title=""
          />
        </svg>
        {/* Run state in words only when the pump reports nothing else — the
            drawing already says it, and a status-looking chip beside the
            card's connection dot and fault badge reads as a third health
            signal. Plain muted text, never a status colour. */}
        {!lead && (
          <span className="truncate text-xs text-muted-foreground">
            {t(`pump.state.${state}`)}
          </span>
        )}
      </div>

      {lead && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {fmt(values[lead.key] as number, lead.digits)}
          {unit ? ` ${unit}` : ""}
        </span>
      )}
    </div>
  );
}
