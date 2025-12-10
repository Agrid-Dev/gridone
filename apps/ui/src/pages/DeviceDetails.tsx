import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Card, Input, Slider, Switch } from "../components/ui";
import { formatAttributeValue } from "../lib/utils";
import { useDeviceDetails } from "../hooks/useDeviceDetails";
import { getSliderRange } from "../utils/sliderPresets";

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

  const attributes = useMemo(
    () => device?.attributes ?? {},
    [device],
  );

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

      <Card className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.4em] text-slate-500">
              {t("deviceDetails.title")}
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              {device.id}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{t("common.driver")}: {device.driver}</p>
          </div>
          <Link
            to="/"
            className="text-sm font-medium text-slate-700 transition-colors hover:text-slate-900"
          >
            {t("common.backToDevices")}
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(device.config).map(([key, value]) => (
            <div
              key={key}
              className="flex justify-between border-b border-slate-100 pb-2 text-sm"
            >
              <span className="font-medium text-slate-700">{key}</span>
              <span className="text-slate-600">{String(value)}</span>
            </div>
          ))}
          {Object.keys(device.config).length === 0 && (
            <p className="text-sm text-slate-500">{t("common.noConfigurationData")}</p>
          )}
        </div>
      </Card>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-slate-900">{t("deviceDetails.attributes")}</h3>
          <p className="text-sm text-slate-600">
            {t("deviceDetails.attributesDescription")}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(attributes).map(([name, attribute]) => {
            const isEditable = attribute.read_write_modes.includes("write");
            const currentValue = draft[name];
            const sliderRange = getSliderRange(name);

            return (
              <Card key={name} className="space-y-4 transition-shadow hover:shadow-md">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{name}</p>
                    <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.4em] text-slate-500">
                      {attribute.data_type}
                    </p>
                  </div>
                  <span
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                      isEditable
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-slate-50 text-slate-600 border border-slate-200"
                    }`}
                  >
                    {isEditable ? t("common.editable") : t("common.readOnly")}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm">
                  <span className="text-slate-600">{t("common.currentValue")}</span>
                  <span className="font-medium text-slate-700">
                    {formatAttributeValue(attribute.current_value)}
                  </span>
                </div>
                {isEditable ? (
                  <div className="space-y-3">
                    {attribute.data_type === "bool" ? (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-700">{t("common.state")}</span>
                        <Switch
                          checked={Boolean(currentValue)}
                          onCheckedChange={(next) => handleDraftChange(name, next)}
                        />
                      </div>
                    ) : attribute.data_type === "int" ||
                      attribute.data_type === "float" ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>{t("common.min")} {sliderRange.min}</span>
                          <span>{t("common.max")} {sliderRange.max}</span>
                        </div>
                        <Slider
                          min={sliderRange.min}
                          max={sliderRange.max}
                          step={sliderRange.step}
                          value={Number(currentValue ?? sliderRange.min)}
                          onChange={(event) =>
                            handleDraftChange(name, Number(event.target.value))
                          }
                        />
                        <p className="text-sm font-medium text-slate-700">
                          {currentValue ?? "—"}
                        </p>
                      </div>
                    ) : (
                      <Input
                        value={currentValue ?? ""}
                        onChange={(event) => handleDraftChange(name, event.target.value)}
                      />
                    )}
                    <Button
                      size="sm"
                      onClick={() => handleSave(name)}
                      disabled={savingAttr === name}
                    >
                      {savingAttr === name ? t("common.updating") : t("common.update")}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">
                    {t("common.lastUpdated")}: {attribute.last_updated ?? "—"}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      </section>
    </section>
  );
}
