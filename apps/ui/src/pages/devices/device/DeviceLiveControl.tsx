import { useMemo } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
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

export default function DeviceLiveControl() {
  const { t } = useTranslation();
  const { deviceId } = useParams<{ deviceId: string }>();
  const { device, draft, savingAttr, feedback, handleDraftChange, handleSave } =
    useDeviceDetails(deviceId);
  const attributes = useMemo(() => device?.attributes ?? {}, [device]);

  return (
    <div className="space-y-4">
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

      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-slate-900">
          {t("deviceDetails.attributes")}
        </h3>
        <p className="text-sm text-slate-600">
          {t("deviceDetails.attributesDescription")}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
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
                    <CardDescription className="mt-0.5">
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
                    {isEditable ? t("common.editable") : t("common.readOnly")}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-2 text-sm">
                  <span className="text-muted-foreground">
                    {t("common.currentValue")}
                  </span>
                  <span className="font-medium text-foreground">
                    {formatAttributeValue(attribute.currentValue)}
                  </span>
                </div>
                {isEditable ? (
                  <div className="space-y-3">
                    {attribute.dataType === "bool" ? (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">
                          {t("common.state")}
                        </span>
                        <Switch
                          checked={Boolean(currentValue)}
                          onCheckedChange={(next) =>
                            handleDraftChange(name, next)
                          }
                        />
                      </div>
                    ) : attribute.dataType === "int" ||
                      attribute.dataType === "float" ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {t("common.min")} {sliderRange.min}
                          </span>
                          <span>
                            {t("common.max")} {sliderRange.max}
                          </span>
                        </div>
                        <Slider
                          min={sliderRange.min}
                          max={sliderRange.max}
                          step={sliderRange.step}
                          value={[Number(currentValue ?? sliderRange.min)]}
                          onValueChange={(values) =>
                            handleDraftChange(name, values[0])
                          }
                        />
                        <p className="text-sm font-medium text-foreground">
                          {currentValue ?? "—"}
                        </p>
                      </div>
                    ) : (
                      <Input
                        value={currentValue != null ? String(currentValue) : ""}
                        onChange={(event) =>
                          handleDraftChange(name, event.target.value)
                        }
                      />
                    )}
                    <Button
                      size="sm"
                      onClick={() => handleSave(name)}
                      disabled={savingAttr === name}
                    >
                      {savingAttr === name
                        ? t("common.updating")
                        : t("common.update")}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("common.lastUpdated")}: {attribute.lastUpdated ?? "—"}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
