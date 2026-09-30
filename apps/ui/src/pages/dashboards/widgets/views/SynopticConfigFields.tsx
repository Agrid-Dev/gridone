import type { Control, FieldValues } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { SelectController } from "@/components/forms/controllers/SelectController";
import { useSynoptics } from "@/pages/synoptics/useSynoptics";
import { useFeatureEnabled } from "@/utils/featureFlags";

function SynopticPicker({ control }: { control: Control<FieldValues> }) {
  const { t } = useTranslation("dashboards");
  const synoptics = useSynoptics();

  return (
    <SelectController
      name="config.synoptic_id"
      control={control}
      label={t("widgets.synoptic.label")}
      placeholder={t("widgets.synoptic.empty")}
      description={
        synoptics.length === 0
          ? t("widgets.synoptic.noSynoptics")
          : t("widgets.synoptic.description")
      }
      options={synoptics.map((synoptic) => ({
        value: synoptic.id,
        label: synoptic.name,
      }))}
      required
    />
  );
}

export function SynopticConfigFields({
  control,
}: {
  control: Control<FieldValues>;
}) {
  const enabled = useFeatureEnabled("synoptics");
  const { t } = useTranslation("dashboards");
  if (!enabled)
    return (
      <p className="text-sm text-muted-foreground">
        {t("widgets.synoptic.disabled")}
      </p>
    );
  return <SynopticPicker control={control} />;
}
