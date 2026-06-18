import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { Device } from "@/api/devices";
import { Section, SectionRow } from "./Section";

/** Read-only device metadata: id, kind, type and tags. No edit affordance —
 *  these are intrinsic, not user-editable. */
export function MetadataSection({ device }: { device: Device }) {
  const { t } = useTranslation(["devices", "common"]);
  const tags = Object.entries(device.tags);

  return (
    <Section title={t("deviceDetails.config.metadata.title")}>
      <SectionRow label={t("deviceDetails.config.metadata.id")}>
        <code className="text-xs">{device.id}</code>
      </SectionRow>
      <SectionRow label={t("deviceDetails.config.metadata.kind")}>
        {t(`common:common.deviceKinds.${device.kind}`)}
      </SectionRow>
      <SectionRow label={t("deviceDetails.config.metadata.type")}>
        {device.type
          ? t(`common:common.deviceTypes.${device.type}`, {
              defaultValue: device.type,
            })
          : t("common:common.none")}
      </SectionRow>
      <SectionRow label={t("deviceDetails.config.metadata.tags")}>
        {tags.length > 0 ? (
          <span className="flex flex-wrap gap-1.5">
            {tags.map(([key, value]) => (
              <Badge key={key} variant="outline" className="font-normal">
                {key}: {value}
              </Badge>
            ))}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {t("common:common.none")}
          </span>
        )}
      </SectionRow>
    </Section>
  );
}
