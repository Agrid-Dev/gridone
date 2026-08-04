/** Browser file downloads. */

/** Triggers a browser download of *blob* under *filename*.
 *
 *  The object URL is revoked straight after the synthetic click: the browser
 *  has already resolved it by then, so holding it would only leak the blob for
 *  the lifetime of the document. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
