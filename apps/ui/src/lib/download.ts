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

/** Opens an empty tab for a file still to be fetched. Call it in the click
 *  handler itself: once the request has resolved, browsers treat the tab as an
 *  unsolicited pop-up and block it. Returns null when they block it anyway. */
export function openBlankTab(): Window | null {
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  return tab;
}

/** Shows *blob* as *type* in the *tab* opened for it, or downloads it as
 *  *filename* when the browser refused that tab. A tab the person closed
 *  meanwhile is left alone.
 *
 *  The object URL lives as long as the tab: the browser's viewer reads it
 *  again to download or print the file, so it is only revoked once the tab is
 *  closed (or with this page). */
export function showBlob(
  tab: Window | null,
  blob: Blob,
  type: string,
  filename: string,
) {
  if (!tab) {
    downloadBlob(blob, filename);
    return;
  }
  if (tab.closed) return;
  const url = URL.createObjectURL(new Blob([blob], { type }));
  tab.location.href = url;
  const watch = window.setInterval(() => {
    if (!tab.closed) return;
    window.clearInterval(watch);
    URL.revokeObjectURL(url);
  }, 5000);
}
