import { useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import type {
  Document,
  DocumentCreate,
  DocumentUpdate,
  DocumentUploadPolicy,
} from "@gridone/sdk";
import { serverErrorMessage } from "@/lib/serverErrorMessage";
import { useDocumentActions } from "./useDocuments";

type Visibility = "" | "admin" | "roles";
export interface DocumentFormValues {
  name: string;
  visibility: Visibility;
  allowed_role_ids: string[];
  asset_ids: string[];
  device_ids: string[];
  file?: File;
}

function metadata(values: DocumentFormValues): DocumentCreate {
  return {
    name: values.name.trim(),
    allowed_role_ids:
      values.visibility === "admin" ? [] : values.allowed_role_ids,
    asset_ids: values.asset_ids,
    device_ids: values.device_ids,
  };
}

/** Send only changed metadata so an unavailable old link does not block renaming. */
function changedMetadata(
  before: Document,
  after: DocumentCreate,
): DocumentUpdate {
  const patch: DocumentUpdate = {};
  if (before.name !== after.name) patch.name = after.name;
  for (const key of ["allowed_role_ids", "asset_ids", "device_ids"] as const) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      patch[key] = after[key];
  }
  return patch;
}

export function useDocumentForm(
  policy: DocumentUploadPolicy,
  document?: Document,
) {
  const { t } = useTranslation("documents");
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const actions = useDocumentActions();
  const schema = useMemo(() => {
    const wireSchema = z.fromJSONSchema(policy.metadata_schema);
    return z
      .object({
        name: z.string(),
        visibility: z.enum(["", "admin", "roles"]),
        allowed_role_ids: z.array(z.string()),
        asset_ids: z.array(z.string()),
        device_ids: z.array(z.string()),
        file: z.instanceof(File).optional(),
      })
      .superRefine((values, ctx) => {
        const result = wireSchema.safeParse(metadata(values));
        if (!result.success)
          for (const issue of result.error.issues)
            ctx.addIssue({
              code: "custom",
              path: issue.path,
              message: t("invalidMetadata"),
            });
        if (
          !values.visibility ||
          (values.visibility === "roles" && !values.allowed_role_ids.length)
        )
          ctx.addIssue({
            code: "custom",
            path: ["visibility"],
            message: t("chooseVisibility"),
          });
        if (!document && !values.file)
          ctx.addIssue({
            code: "custom",
            path: ["file"],
            message: t("chooseFile"),
          });
        if (values.file) {
          const extension = values.file.name
            .slice(values.file.name.lastIndexOf("."))
            .toLowerCase();
          if (
            !values.file.size ||
            values.file.size > policy.max_file_bytes ||
            !policy.extensions.includes(extension)
          )
            ctx.addIssue({
              code: "custom",
              path: ["file"],
              message: t("invalidFile"),
            });
        }
      });
  }, [policy, document, t]);
  const form = useForm<DocumentFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: document?.name ?? "",
      visibility: document
        ? document.allowed_role_ids.length
          ? "roles"
          : "admin"
        : "",
      allowed_role_ids: document?.allowed_role_ids ?? [],
      asset_ids:
        document?.asset_ids ??
        (search.get("asset_id") ? [search.get("asset_id")!] : []),
      device_ids:
        document?.device_ids ??
        (search.get("device_id") ? [search.get("device_id")!] : []),
    },
  });
  const visibility = useWatch({ control: form.control, name: "visibility" });
  const assetIds = useWatch({ control: form.control, name: "asset_ids" });
  const deviceIds = useWatch({ control: form.control, name: "device_ids" });
  const roleIds = useWatch({ control: form.control, name: "allowed_role_ids" });
  function selectFile(file?: File) {
    form.setValue("file", file, { shouldValidate: true });
    if (file && !form.getValues("name"))
      form.setValue("name", file.name, { shouldValidate: true });
  }
  const submit = form.handleSubmit(async (values) => {
    form.clearErrors("root");
    try {
      const saved = document
        ? await actions.update.mutateAsync({
            id: document.id,
            patch: changedMetadata(document, metadata(values)),
          })
        : await actions.create.mutateAsync({
            metadata: metadata(values),
            file: values.file!,
          });
      navigate(`/documents/${encodeURIComponent(saved.id)}`);
    } catch (error) {
      form.setError("root", {
        message: serverErrorMessage(error) || t("error"),
      });
    }
  });
  return { form, visibility, assetIds, deviceIds, roleIds, selectFile, submit };
}
