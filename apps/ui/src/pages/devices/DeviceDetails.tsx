import { useMemo } from "react";
import { Link, useParams } from "react-router";
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

export default function DeviceDetails() {
  const { t } = useTranslation();
  const { deviceId } = useParams<{ deviceId: string }>();
  const {
    device,
    loading,
    error,
    draft,
    savingAttr,
    feedback,
    handleDraftChange,
    handleSave,
  } = useDeviceDetails(deviceId);
  const attributes = useMemo(() => device?.attributes ?? {}, [device]);

  if (loading) {
    return (
      <section className="space-y-4">
        <div className="h-56 animate-pulse rounded-lg border border-slate-200 bg-white" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-lg border border-slate-200 bg-white"
            />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
        <Link
          to="/"
          className="inline-block text-sm font-medium text-slate-700 transition-colors hover:text-slate-900"
        >
          {t("common.backToDevices")}
        </Link>
      </section>
    );
  }

  if (!device) {
    return null;
  }

  return (
    <section className="space-y-6">
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

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <CardDescription>{t("deviceDetails.title")}</CardDescription>
              <CardTitle className="mt-1">{device.id}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("common.driver")}: {device.driver}
              </p>
            </div>
            <Link
              to="/"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("common.backToDevices")}
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(device.config).map(([key, value]) => (
              <div
                key={key}
                className="flex justify-between border-b border-border pb-2 text-sm"
              >
                <span className="font-medium text-foreground">{key}</span>
                <span className="text-muted-foreground">{String(value)}</span>
              </div>
            ))}
            {Object.keys(device.config).length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t("common.noConfigurationData")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
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
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">{name}</CardTitle>
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
                      {formatAttributeValue(attribute.current_value)}
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
                          value={
                            currentValue != null ? String(currentValue) : ""
                          }
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
                      {t("common.lastUpdated")}: {attribute.last_updated ?? "—"}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </section>
  );
}
