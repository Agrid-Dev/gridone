import { FC } from "react";
import { useTranslation } from "react-i18next";
import type { Automation } from "@gridone/sdk";
import { useUser } from "@/hooks/useUser";
import BasePresenter from "./BasePresenter";
import { AutomationStatusBadge } from "../../components/AutomationStatusBadge";

/** UI-side view props (camelCase); callers map the SDK's snake_case
 *  ``created_at`` / ``updated_at`` / ``created_by`` fields into them. */
type MetadataPresenterProps = Pick<
  Automation,
  "name" | "description" | "enabled"
> & {
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
};

const MetadataPresenter: FC<MetadataPresenterProps> = ({
  name,
  description,
  enabled,
  createdAt,
  updatedAt,
  createdBy,
}) => {
  const { t } = useTranslation("automations");
  const creator = useUser(createdBy);

  const wasEdited = createdAt && updatedAt && updatedAt !== createdAt;

  return (
    <BasePresenter
      title={
        <span className="flex items-center gap-2">
          {name}
          <AutomationStatusBadge enabled={enabled ?? true} />
        </span>
      }
    >
      {description ? (
        <p className="text-sm leading-relaxed text-foreground/80">
          {description}
        </p>
      ) : (
        <p className="text-sm italic text-muted-foreground">
          {t("metadata.noDescription")}
        </p>
      )}
      {createdAt && (
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <p>
            {t("metadata.createdAt")}: {new Date(createdAt).toLocaleString()}
            {creator && (
              <>
                {" "}
                · {t("metadata.createdBy")}: {creator.username}
              </>
            )}
          </p>
          {wasEdited && (
            <p>
              {t("metadata.updatedAt")}: {new Date(updatedAt!).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </BasePresenter>
  );
};

export default MetadataPresenter;
