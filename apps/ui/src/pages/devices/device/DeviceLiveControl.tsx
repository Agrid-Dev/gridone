import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
  Input,
  Slider,
  Switch,
} from "@/components/ui";
import { formatAttributeValue } from "@/lib/utils";
import { useDeviceDetails } from "@/hooks/useDeviceDetails";
import { getSliderRange } from "@/utils/sliderPresets";
import { toLabel } from "@/lib/textFormat";
import { getStandardDeviceEntry } from "../standard-devices/registry";

export default function DeviceLiveControl() {
  const { t } = useTranslation("devices");
  const { deviceId } = useParams<{ deviceId: string }>();
  const { device, draft, savingAttr, feedback, handleDraftChange, handleSave } =
    useDeviceDetails(deviceId);
  const attributes = useMemo(() => device?.attributes ?? {}, [device]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const standardEntry = device
    ? getStandardDeviceEntry(device.type)
    : undefined;

  const isStandard = !!standardEntry;

  return (
    <div className="space-y-8">
      {/* ── Standard control (if registered) ── */}
      {standardEntry && device && (
        <div className="py-2">
          <standardEntry.Control
            device={device}
            draft={draft}
            savingAttr={savingAttr}
            feedback={feedback}
            onDraftChange={handleDraftChange}
            onSave={handleSave}
          />
        </div>
      )}

      {/* ── Feedback banner ── */}
      {feedback && (
        <div
          className={`rounded-lg border p-4 text-sm transition-colors ${
            feedback.type === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* ── Attributes grid ── */}
      {isStandard ? (
        /* For standard devices: collapsible advanced section */
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="group flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {showAdvanced ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            {t("deviceDetails.advancedAttributes")}
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
              {Object.keys(attributes).length}
            </span>
          </button>

          {showAdvanced && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <AttributeCards
                attributes={attributes}
                draft={draft}
                savingAttr={savingAttr}
                onDraftChange={handleDraftChange}
                onSave={handleSave}
              />
            </div>
          )}
        </div>
      ) : (
        /* For non-standard devices: show directly */
        <>
          <h3 className="font-display text-lg font-semibold text-foreground">
            {t("deviceDetails.attributes")}
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <AttributeCards
              attributes={attributes}
              draft={draft}
              savingAttr={savingAttr}
              onDraftChange={handleDraftChange}
              onSave={handleSave}
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ── Extracted attribute cards ── */

type Attribute = {
  dataType: string;
  readWriteModes: string[];
  currentValue: unknown;
  lastUpdated?: string | null;
};

function AttributeCards({
  attributes,
  draft,
  savingAttr,
  onDraftChange,
  onSave,
}: {
  attributes: Record<string, Attribute>;
  draft: Record<string, string | number | boolean | null>;
  savingAttr: string | null;
  onDraftChange: (
    name: string,
    value: string | number | boolean | null,
  ) => void;
  onSave: (name: string) => void;
}) {
  const { t } = useTranslation("devices");

  return (
    <>
      {Object.entries(attributes).map(([name, attribute]) => {
        const isEditable = attribute.readWriteModes.includes("write");
        const currentValue = draft[name];
        const sliderRange = getSliderRange(name);

        return (
          <Card key={name} className="transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">{toLabel(name)}</CardTitle>
                  <CardDescription className="mt-0.5 font-mono text-xs">
                    {attribute.dataType}
                  </CardDescription>
                </div>
                <span
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    isEditable
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-muted text-muted-foreground border border-border"
                  }`}
                >
                  {isEditable
                    ? t("common:common.editable")
                    : t("common:common.readOnly")}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-2 text-sm">
                <span className="text-muted-foreground">
                  {t("common:common.currentValue")}
                </span>
                <span className="font-mono font-medium text-foreground">
                  {formatAttributeValue(attribute.currentValue)}
                </span>
              </div>
              {isEditable ? (
                <div className="space-y-3">
                  {attribute.dataType === "bool" ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        {t("common:common.state")}
                      </span>
                      <Switch
                        checked={Boolean(currentValue)}
                        onCheckedChange={(next) => onDraftChange(name, next)}
                      />
                    </div>
                  ) : attribute.dataType === "int" ||
                    attribute.dataType === "float" ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {t("common:common.min")} {sliderRange.min}
                        </span>
                        <span>
                          {t("common:common.max")} {sliderRange.max}
                        </span>
                      </div>
                      <Slider
                        min={sliderRange.min}
                        max={sliderRange.max}
                        step={sliderRange.step}
                        value={[Number(currentValue ?? sliderRange.min)]}
                        onValueChange={(values) =>
                          onDraftChange(name, values[0])
                        }
                      />
                      <p className="font-mono text-sm font-medium text-foreground">
                        {currentValue ?? "—"}
                      </p>
                    </div>
                  ) : (
                    <Input
                      value={currentValue != null ? String(currentValue) : ""}
                      onChange={(event) =>
                        onDraftChange(name, event.target.value)
                      }
                    />
                  )}
                  <Button
                    size="sm"
                    onClick={() => onSave(name)}
                    disabled={savingAttr === name}
                  >
                    {savingAttr === name
                      ? t("common:common.updating")
                      : t("common:common.update")}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("common:common.lastUpdated")}:{" "}
                  {attribute.lastUpdated ?? "—"}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
