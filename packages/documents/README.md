# Documents

`DocumentsService(storage_url)` owns uploaded files and their metadata. Call
`start()` before use and `stop()` on shutdown. A null URL uses memory; PostgreSQL
stores metadata and bytes atomically in the `documents` table. List and metadata
reads never select the binary payload.

Every read takes a `DocumentAccess` resolved by the controller. Admins see all
documents; other roles see only explicitly shared documents. The controller
enforces module permissions and validates role, asset and device references.
These identifiers are opaque to this package, with no cross-service foreign keys.

Uploads accept PDF, PNG, JPEG, CSV, TXT, XLSX and DOCX up to 100 MiB. Text files
must be UTF-8 (optional BOM) or UTF-16 with a BOM. Downloads preserve the original
bytes. Documents have no versions, folders, previews or public share links.
Deleting a linked asset/device does not delete its documents. Keep originals
outside Gridone until the installation has an independently verified backup.
