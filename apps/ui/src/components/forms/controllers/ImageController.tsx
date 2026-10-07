import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  useController,
  type FieldError,
  type FieldPath,
  type FieldValues,
  type UseControllerProps,
} from "react-hook-form";
import { ImageUp, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldShell } from "./FieldShell";

type ImageControllerProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = UseControllerProps<TFieldValues, TName> & {
  label?: ReactNode;
  description?: ReactNode;
  required?: boolean;
  /** The `image/*` media type a file must have, e.g. `image/png`: it filters
   *  the file dialog and types the preview. */
  mediaType: string;
  /** Largest file accepted, in bytes; any size when undefined. */
  maxBytes?: number;
};

/**
 * Image upload, for a string field holding the raw base64 of a file (without
 * any `data:` prefix): choose a file, preview it, replace it — or remove it,
 * unless the field is required. A file over `maxBytes`, of another media type
 * than `mediaType`, or that the browser cannot decode as an image, is refused
 * (`readImageFile`), and the value stays as it was.
 *
 * Only the latest choice lands: a file still being read when another is
 * chosen, or when the image is removed, is dropped once read.
 *
 * A removed image is held as `""`, not `undefined`: a controller reads
 * `undefined` as "fall back to the default value", which would bring the
 * stored image back. What `""` sends is the form's call (a schema form sends
 * `null` for an optional field, the app config form drops the key) — hence no
 * Remove on a required image, whose value the payload must carry.
 */
export function ImageController<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  label,
  description,
  required,
  mediaType,
  maxBytes,
  ...controllerProps
}: ImageControllerProps<TFieldValues, TName>) {
  const { t, i18n } = useTranslation("common");
  const { field, fieldState } = useController(controllerProps);
  const id = field.name;
  const inputRef = useRef<HTMLInputElement>(null);
  // Moved on by every choice and removal: a read finding it moved is stale.
  const latestChoice = useRef(0);
  const [refusal, setRefusal] = useState<string | null>(null);
  const value =
    typeof field.value === "string" && field.value !== ""
      ? field.value
      : undefined;
  // A refused file leaves the value as it was, so its reason shows in the
  // field's own error slot rather than through react-hook-form.
  const error: FieldError | undefined = refusal
    ? { type: "validate", message: refusal }
    : fieldState.error;

  const refusalMessage = (reason: ImageRefusal): string => {
    switch (reason) {
      case "tooLarge":
        return t("schemaForm.image.tooLarge", {
          size: formatKilobytes(maxBytes ?? 0, i18n.language),
        });
      case "wrongType":
        return t("schemaForm.image.wrongType", {
          format: mediaTypeName(mediaType),
        });
      case "unreadable":
        return t("schemaForm.image.unreadable");
    }
  };

  const takeFile = async (file: File) => {
    const choice = ++latestChoice.current;
    setRefusal(null);
    const read = await readImageFile(file, mediaType, maxBytes);
    if (choice !== latestChoice.current) return;
    if ("refusal" in read) {
      setRefusal(refusalMessage(read.refusal));
      return;
    }
    field.onChange(read.base64);
  };

  const removeImage = () => {
    latestChoice.current += 1;
    setRefusal(null);
    field.onChange("");
  };

  return (
    <FieldShell
      id={id}
      invalid={error !== undefined}
      label={label}
      description={description}
      error={error}
      required={required}
    >
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={mediaType}
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          // Cleared so that choosing the same file again still fires.
          event.currentTarget.value = "";
          if (file) void takeFile(file);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        {value && (
          // On mid-grey: a light image with transparency (a logo for a dark
          // screen) shows as well as a dark one.
          <img
            src={`data:${mediaType};base64,${value}`}
            alt={t("schemaForm.image.preview")}
            className="h-20 max-w-48 rounded-md border bg-muted-foreground object-contain"
          />
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          onBlur={field.onBlur}
        >
          <ImageUp />
          {t(value ? "schemaForm.image.replace" : "schemaForm.image.choose")}
        </Button>
        {value && !required && (
          <Button type="button" variant="ghost" onClick={removeImage}>
            <Trash2 />
            {t("schemaForm.image.remove")}
          </Button>
        )}
      </div>
    </FieldShell>
  );
}

/** Why an image field refuses a chosen file. */
type ImageRefusal = "tooLarge" | "wrongType" | "unreadable";

/** Leading bytes every file of a media type starts with, where they are cheap
 *  to check and decisive: a JPEG renamed `logo.png` still starts `FF D8 FF`. */
const FILE_SIGNATURES: Record<string, readonly number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/jpeg": [0xff, 0xd8, 0xff],
};

const SVG_MEDIA_TYPE = "image/svg+xml";

/**
 * Reads a file chosen for an image field declaring `mediaType`: its raw
 * base64, or why it is refused. In order: over `maxBytes`, checked before
 * anything is read; of another media type (`hasMediaType`); or not decodable
 * as an image — truncated, not an image at all, or gone from the disk since
 * it was chosen. An SVG is decoded by an `<img>` element, since
 * `createImageBitmap` rejects every SVG.
 */
async function readImageFile(
  file: File,
  mediaType: string,
  maxBytes: number | undefined,
): Promise<{ base64: string } | { refusal: ImageRefusal }> {
  if (maxBytes !== undefined && file.size > maxBytes) {
    return { refusal: "tooLarge" };
  }
  const type = mediaType.toLowerCase();
  try {
    if (!(await hasMediaType(file, type))) return { refusal: "wrongType" };
    if (type === SVG_MEDIA_TYPE) {
      const base64 = await readBase64(file);
      const image = new Image();
      image.src = `data:${type};base64,${base64}`;
      await image.decode();
      return { base64 };
    }
    (await createImageBitmap(file)).close();
    return { base64: await readBase64(file) };
  } catch {
    return { refusal: "unreadable" };
  }
}

/** Whether `file` is of the (lower-case) `mediaType`: by the type the browser
 *  gives it — which comes from its extension, so a hint only — and, where a
 *  signature is known (`FILE_SIGNATURES`), by its leading bytes. */
async function hasMediaType(file: File, mediaType: string): Promise<boolean> {
  if (file.type !== mediaType) return false;
  const signature = FILE_SIGNATURES[mediaType];
  if (signature === undefined) return true;
  const head = new Uint8Array(
    await file.slice(0, signature.length).arrayBuffer(),
  );
  return signature.every((byte, index) => head[index] === byte);
}

/** A media type as users name the format: `image/png` -> `PNG`,
 *  `image/svg+xml` -> `SVG`. */
function mediaTypeName(mediaType: string): string {
  const subtype = mediaType.slice(mediaType.indexOf("/") + 1);
  return subtype.split("+")[0].toUpperCase();
}

/** The file's bytes in base64: `readAsDataURL` yields
 *  `data:image/png;base64,iVBORw0…`, and everything up to the first comma is
 *  dropped. Rejects when the file cannot be read. */
function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** A byte count in kilobytes (1 KB = 1024 bytes), to state an upload cap. */
function formatKilobytes(bytes: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    bytes / 1024,
  );
}
