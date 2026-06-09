/** Resolution logic for the org avatar (building profile identity).
 *
 *  An avatar is resolved, in priority order, to:
 *    1. a curated icon, when the stored value matches a registry key;
 *    2. an image, when the stored value is a resolvable image src
 *       (an http(s) URL or a base64 `data:image/...` URI);
 *    3. initials derived from the org name ("Accor" -> "A", "John Doe" -> "JD");
 *    4. a neutral fallback when nothing else resolves.
 *
 *  Kept framework-free so the order and the src/initials heuristics are unit
 *  tested without rendering. */

export type OrgAvatarContent =
  | { kind: "icon"; key: string }
  | { kind: "image"; src: string }
  | { kind: "initials"; text: string }
  | { kind: "fallback" };

/** Whether `value` can be confidently rendered as an `<img src>`: an http(s)
 *  URL, or a base64 (or otherwise inline) `data:image/...` URI. Bare strings,
 *  icon keys, relative paths and non-image data URIs are rejected. */
export function isImageSrc(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (/^data:image\//i.test(v)) return true;
  try {
    const url = new URL(v);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Initials for an org name: a single word yields its first letter
 *  ("Accor" -> "A"); multiple words yield the first letter of the first and
 *  last words ("John Doe" -> "JD"). */
export function orgInitials(name: string | null | undefined): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function resolveOrgAvatar(
  icon: string | null | undefined,
  name: string | null | undefined,
  iconKeys: ReadonlySet<string>,
): OrgAvatarContent {
  const key = icon?.trim();
  if (key && iconKeys.has(key)) return { kind: "icon", key };
  if (key && isImageSrc(key)) return { kind: "image", src: key };
  const initials = orgInitials(name);
  if (initials) return { kind: "initials", text: initials };
  return { kind: "fallback" };
}
