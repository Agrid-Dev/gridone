import { useTranslation } from "react-i18next";
import type { Document } from "@gridone/sdk";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldLabel,
  FieldError,
  FieldDescription,
} from "@/components/ui/field";
import {
  useDocumentChoices,
  useDocumentFromRoute,
  useDocumentUploadPolicy,
  documentSize,
} from "./useDocuments";
import { useDocumentForm } from "./useDocumentForm";

const selectClass =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function choicesWithMissing(
  choices: { id: string; name: string }[],
  selected: string[],
  unavailable: string,
) {
  return [
    ...choices,
    ...selected
      .filter((id) => !choices.some((c) => c.id === id))
      .map((id) => ({ id, name: `${id} — ${unavailable}` })),
  ];
}

export function DocumentForm({ document }: { document?: Document }) {
  const { t, i18n } = useTranslation("documents");
  const policy = useDocumentUploadPolicy();
  const choices = useDocumentChoices();
  const { form, visibility, assetIds, deviceIds, roleIds, selectFile, submit } =
    useDocumentForm(policy, document);
  const { errors, isSubmitting } = form.formState;
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <ResourceHeader
        title={t(document ? "edit" : "add")}
        caption={t("formCaption")}
      />
      <form onSubmit={submit} className="space-y-6">
        <fieldset disabled={isSubmitting} className="space-y-6">
          {!document && (
            <Field data-invalid={!!errors.file}>
              <FieldLabel htmlFor="document-file">{t("file")}</FieldLabel>
              <Input
                id="document-file"
                type="file"
                accept={policy.extensions.join(",")}
                aria-invalid={!!errors.file}
                onChange={(event) => selectFile(event.target.files?.[0])}
              />
              <FieldDescription>
                {t("fileHint", {
                  formats: policy.extensions.join(", "),
                  limit: documentSize(policy.max_file_bytes, i18n.language),
                })}
              </FieldDescription>
              {errors.file && <FieldError errors={[errors.file]} />}
            </Field>
          )}
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="document-name">{t("name")}</FieldLabel>
            <Input
              id="document-name"
              {...form.register("name")}
              aria-invalid={!!errors.name}
            />
            {errors.name && <FieldError errors={[errors.name]} />}
          </Field>
          <Field
            data-invalid={!!errors.visibility || !!errors.allowed_role_ids}
          >
            <FieldLabel htmlFor="document-visibility">
              {t("visibility")}
            </FieldLabel>
            <select
              id="document-visibility"
              className={selectClass}
              {...form.register("visibility")}
              aria-invalid={!!errors.visibility}
            >
              <option value="">{t("chooseVisibility")}</option>
              <option value="admin">{t("adminOnly")}</option>
              <option value="roles">{t("selectedRoles")}</option>
            </select>
            <FieldDescription>{t("adminAccess")}</FieldDescription>
            {visibility === "roles" && (
              <>
                <FieldLabel htmlFor="document-roles">{t("roles")}</FieldLabel>
                <select
                  id="document-roles"
                  className={selectClass}
                  multiple
                  {...form.register("allowed_role_ids")}
                >
                  {choicesWithMissing(
                    choices.roles,
                    roleIds,
                    t("unavailable"),
                  ).map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  disabled={choices.loading}
                  onClick={() =>
                    form.setValue(
                      "allowed_role_ids",
                      choices.roles.map((r) => r.id),
                      { shouldValidate: true, shouldDirty: true },
                    )
                  }
                >
                  {t("allRoles")}
                </Button>
              </>
            )}
            {(errors.visibility || errors.allowed_role_ids) && (
              <FieldError
                errors={[errors.visibility, errors.allowed_role_ids]}
              />
            )}
          </Field>
          {(["asset_ids", "device_ids"] as const).map((key) => (
            <Field key={key} data-invalid={!!errors[key]}>
              <FieldLabel htmlFor={`document-${key}`}>
                {t(key === "asset_ids" ? "assets" : "devices")}
              </FieldLabel>
              <select
                id={`document-${key}`}
                className={selectClass}
                multiple
                {...form.register(key)}
              >
                {choicesWithMissing(
                  key === "asset_ids" ? choices.assets : choices.devices,
                  key === "asset_ids" ? assetIds : deviceIds,
                  t("unavailable"),
                ).map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <FieldDescription>{t("multipleHint")}</FieldDescription>
              {errors[key] && <FieldError errors={[errors[key]]} />}
            </Field>
          ))}
        </fieldset>
        {errors.root && <FieldError errors={[errors.root]} />}
        <div className="flex justify-end gap-3">
          <Button asChild variant="outline" disabled={isSubmitting}>
            <Link to={document ? `/documents/${document.id}` : "/documents"}>
              {t("cancel")}
            </Link>
          </Button>
          <Button type="submit" disabled={isSubmitting || choices.loading}>
            {isSubmitting ? t("saving") : t(document ? "save" : "upload")}
          </Button>
        </div>
      </form>
    </section>
  );
}

export function DocumentEdit() {
  const document = useDocumentFromRoute();
  return <DocumentForm key={document.id} document={document} />;
}
