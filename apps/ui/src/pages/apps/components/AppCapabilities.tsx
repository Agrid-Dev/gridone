import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { toLabel } from "@/lib/textFormat";
import type { AppCapabilities as Capabilities } from "@gridone/sdk";

interface AppCapabilitiesProps {
  capabilities: Capabilities;
}

/** Device types, with the attributes the app touches on each. */
const AttributesByType: FC<{
  label: string;
  entries: Record<string, string[]>;
}> = ({ label, entries }) => (
  <div>
    <p className="text-sm text-muted-foreground">{label}</p>
    <ul className="mt-1 space-y-1">
      {Object.entries(entries).map(([deviceType, attributes]) => (
        <li key={deviceType} className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {toLabel(deviceType)}
          </span>
          {attributes.map((attribute) => (
            <Badge key={attribute} variant="outline" className="text-xs">
              {attribute}
            </Badge>
          ))}
        </li>
      ))}
    </ul>
  </div>
);

/**
 * What an app declares it will do with devices, read off its manifest.
 *
 * Informative only: gridone displays the declaration so an operator knows what
 * an app will touch before accepting it, but enforces nothing in v1.
 */
export const AppCapabilities: FC<AppCapabilitiesProps> = ({ capabilities }) => {
  const { t } = useTranslation("apps");
  // Each field carries a default server-side, so the schema types them optional.
  const { produces = [], reads = {}, commands = {} } = capabilities;
  const declaresNothing =
    produces.length === 0 &&
    Object.keys(reads).length === 0 &&
    Object.keys(commands).length === 0;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-foreground">
        {t("capabilities.title")}
      </h3>
      {declaresNothing ? (
        <p className="text-sm text-muted-foreground">
          {t("capabilities.none")}
        </p>
      ) : (
        <div className="space-y-3">
          {produces.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground">
                {t("capabilities.produces")}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {produces.map((deviceType) => (
                  <Badge key={deviceType} variant="outline">
                    {toLabel(deviceType)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {Object.keys(reads).length > 0 && (
            <AttributesByType label={t("capabilities.reads")} entries={reads} />
          )}
          {Object.keys(commands).length > 0 && (
            <AttributesByType
              label={t("capabilities.commands")}
              entries={commands}
            />
          )}
        </div>
      )}
    </div>
  );
};
