import { isGridoneError, type RelatedResource } from "@gridone/sdk";
import { z } from "zod";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";

const conflictSchema = z.object({
  code: z.string(),
  resources: z.array(
    z.object({
      kind: z.enum([
        "device",
        "driver",
        "device_group",
        "automation",
        "command_template",
      ]),
      id: z.string(),
      name: z.string(),
    }),
  ),
});

export function groupConflict(error: unknown) {
  if (!isGridoneError(error)) return null;
  const result = conflictSchema.safeParse(error.rawDetail);
  return result.success ? result.data : null;
}

const resourcePaths: Record<RelatedResource["kind"], string> = {
  device: "/devices",
  driver: "/drivers",
  device_group: "/devices/groups",
  automation: "/automations",
  command_template: "/devices/commands/templates",
};

export function GroupReferenceLinks({
  resources,
}: {
  resources: RelatedResource[];
}) {
  return (
    <ul className="list-inside list-disc">
      {resources.map((r) => (
        <li key={`${r.kind}:${r.id}`}>
          <Link
            className="underline"
            to={`${resourcePaths[r.kind]}/${encodeURIComponent(r.id)}`}
          >
            {r.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function GroupError({ error }: { error: unknown }) {
  const { t } = useTranslation("devices");
  if (!error) return null;
  const conflict = groupConflict(error);
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
    >
      <p>
        {conflict
          ? t(`groups.errors.${conflict.code}`, {
              defaultValue: t("groups.errors.failed"),
            })
          : t("groups.errors.failed")}
      </p>
      {conflict && <GroupReferenceLinks resources={conflict.resources} />}
    </div>
  );
}
