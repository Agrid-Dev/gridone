import { FC } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import BasePresenter from "./BasePresenter";
import { AutomationStatusBadge } from "../../components/AutomationStatusBadge";
import { getUser } from "@/api/users";

interface MetadataPresenterProps {
  name: string;
  description: string;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

const MetadataPresenter: FC<MetadataPresenterProps> = ({
  name,
  description,
  enabled,
  createdAt,
  updatedAt,
  createdBy,
}) => {
  const { t } = useTranslation("automations");

  const { data: creator } = useQuery({
    queryKey: ["users", createdBy],
    queryFn: () => getUser(createdBy!),
    enabled: !!createdBy,
  });

  const wasEdited = createdAt && updatedAt && updatedAt !== createdAt;

  return (
    <BasePresenter
      title={
        <span className="flex items-center gap-2">
          {name}
          <AutomationStatusBadge enabled={enabled} />
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
