# Documents

DocumentsService(storage_url) owns uploaded files and their metadata. Call
start() before use and stop() on shutdown. A null URL uses memory; PostgreSQL
stores metadata and bytes atomically in the documents table. List and metadata
reads never select the binary payload.

## Scope and acceptance criteria

- Upload one non-empty file, list/search documents by name with pagination,
  retrieve metadata, download original bytes, rename and delete.
- Store the document ID, name, original filename, validated media type, size,
  opaque author ID and creation/update timestamps.
- Persist files across restarts with PostgreSQL; failed uploads leave no entry.
- Accept PDF, PNG, JPEG, CSV, TXT, XLSX and DOCX up to 100 MiB. Check content rather
  than trusting the browser MIME type. Text files must be UTF-8 (optional BOM) or
  UTF-16 with a BOM, including Unicode spaces in CSV exports.
- Allow optional asset/equipment links and filters. Store their IDs as opaque
  metadata; the API validates references through the existing services.
- Keep authorization in the controller using the existing users permissions.
  This service has no knowledge of roles or permissions and does not import
  the assets or devices services.

Per-document sharing, folders, versions, replacement,
previews, public links and content search are outside this first version.
Deleting an asset or equipment keeps the document and its now-unavailable link.
An upgrade migration removes sharing metadata from earlier PR installations
without changing the files or their asset/equipment links.
Scoped permissions can be added through the users service in a separate change.
Keep originals outside Gridone until the installation has a verified backup.
