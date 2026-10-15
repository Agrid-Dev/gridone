import { Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { Document } from "@gridone/sdk";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { ResourceHeader } from "@/components/ResourceHeader";
import { FieldShell } from "@/components/forms/controllers/FieldShell";
import { InputController } from "@/components/forms/controllers/InputController";
import { MultiSelectController } from "@/components/forms/controllers/MultiSelectController";
import { SelectController } from "@/components/forms/controllers/SelectController";
import { ServerErrorAlert } from "@/components/forms/schema-form/ServerErrorAlert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  useDocumentFromRoute,
  useDocumentUploadPolicy,
  documentSize,
} from "./useDocuments";
import { useDocumentForm } from "./useDocumentForm";

export function DocumentForm({ document }: { document?: Document }) {
  const { t, i18n } = useTranslation("documents");
  const policy = useDocumentUploadPolicy();
  const { form, options, choicesLoading, cancelTo, selectFile, submit } =
    useDocumentForm(policy, document);
  const { errors, isSubmitting } = form.formState;
  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t(document ? "edit" : "add")}
        caption={t("formCaption")}
      />
      <Card className="max-w-3xl">
        <form onSubmit={submit} noValidate>
          <CardContent className="space-y-6 pt-6">
            <fieldset disabled={isSubmitting} className="space-y-6">
              {!document && (
                <Controller
                  name="file"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <FieldShell
                      id="document-file"
                      label={t("file")}
                      required
                      invalid={fieldState.invalid}
                      error={fieldState.error}
                      description={t("fileHint", {
                        formats: policy.extensions.join(", "),
                        limit: documentSize(
                          policy.max_file_bytes,
                          i18n.language,
                        ),
                      })}
                    >
                      <Input
                        id="document-file"
                        type="file"
                        accept={policy.extensions.join(",")}
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        aria-required
                        aria-invalid={fieldState.invalid}
                        onChange={(event) =>
                          selectFile(event.target.files?.[0])
                        }
                      />
                    </FieldShell>
                  )}
                />
              )}
              <InputController
                name="name"
                control={form.control}
                label={t("name")}
                required
              />
              <SelectController
                name="folder_id"
                control={form.control}
                label={t("folder")}
                options={options.folder_id}
                allowEmpty
                emptyValue={null}
                emptyLabel={t("noFolder")}
              />
              <div className="grid gap-6 sm:grid-cols-2">
                {(["asset_ids", "device_ids"] as const).map((key) => (
                  <MultiSelectController
                    key={key}
                    name={key}
                    control={form.control}
                    label={t(key === "asset_ids" ? "assets" : "devices")}
                    description={t("multipleHint")}
                    options={options[key]}
                    placeholder={t(
                      key === "asset_ids" ? "chooseAssets" : "chooseDevices",
                    )}
                    searchPlaceholder={t(
                      key === "asset_ids" ? "searchAssets" : "searchDevices",
                    )}
                    emptyMessage={t("noOptions")}
                  />
                ))}
              </div>
            </fieldset>
            <ServerErrorAlert message={errors.root?.message} />
          </CardContent>
          <CardFooter className="justify-end gap-3 border-t pt-6">
            <Button asChild variant="outline" disabled={isSubmitting}>
              <Link to={cancelTo}>{t("cancel")}</Link>
            </Button>
            <Button type="submit" disabled={isSubmitting || choicesLoading}>
              {isSubmitting ? t("saving") : t(document ? "save" : "upload")}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </section>
  );
}

export function DocumentEdit() {
  const document = useDocumentFromRoute();
  return <DocumentForm key={document.id} document={document} />;
}
