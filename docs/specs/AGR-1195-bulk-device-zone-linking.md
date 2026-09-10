# AGR-1195: Bulk device-to-zone linking

Issue: [Lier plusieurs devices à une zone en même temps](https://linear.app/agrid-bms/issue/AGR-1195/lier-plusieurs-devices-a-une-zone-en-meme-temps)

Status: Proposed implementation plan

## Objective and scope

Support two workflows:

1. Select several devices within a zone and link them in one action.
2. Import device-to-zone assignments from the devices list using resource IDs.

The proposed import format is CSV with `device_id` and `asset_id` columns, where `asset_id` is the zone ID. CSV is an assumption for this plan; the issue requests a mapping upload without specifying its format.

Each device retains one zone membership. Assigning a device to another zone moves it. The issue description mentions selecting several zones, but this plan follows the clarified requirement to select several devices within a zone.

## Existing implementation

- Zone membership is stored in the device's `asset_id` tag.
- `apps/ui/src/pages/assets/components/DeviceLinkDialog.tsx` currently selects and links one device. Zone detail and edit pages share this dialog.
- `apps/ui/src/hooks/useDeviceAssetLink.ts` calls the SDK's tag methods and invalidates asset and device-list queries.
- The API and TypeScript SDK expose single-device tag updates. The existing device batch endpoint creates devices; it does not assign zones.
- `apps/ui/src/components/forms/targetPicker/DevicePickerTable.tsx` provides an existing checkbox-selection pattern to reuse where appropriate.
- `apps/ui/src/lib/csv.ts` provides CSV export utilities that can support the downloadable template.

## Implementation steps

### 1. Support multiple devices in the zone picker

Update the shared device-link dialog with checkboxes, a selected count, “Select all matching,” and a “Link N devices” action.

- Preserve selections when searching by device name or ID.
- Make select-all affect the matching devices only, preserving selections outside the current search.
- Exclude devices already linked to the target zone.
- Show each device's current zone so users can recognize reassignments.
- Reset selection and search when the dialog closes.
- Disable submission for an empty selection or while a request is pending.
- Provide loading, empty, and error states, with accessible checkbox labels and keyboard interaction.

### 2. Add a shared batch assignment API and SDK method

Introduce a JSON endpoint accepting the following request shape, used by both workflows:

```json
{
  "assignments": [
    { "device_id": "0123456789abcdef", "asset_id": "fedcba9876543210" }
  ]
}
```

- Use typed request and result models with non-empty IDs and assignment lists.
- Validate that devices and target zones exist before writing.
- Reject conflicting assignments for the same device; collapse identical duplicates.
- Skip assignments that already match the device's current zone.
- Keep membership in the existing `asset_id` tag and reuse `set_device_tag`; no database migration is needed.
- Coordinate device and asset services in the API layer, preserving service independence.
- Require `devices:write`, consistent with the current linking action.
- Return per-device outcomes for applied, unchanged, and failed assignments. Use safe error messages rather than exposing internal exceptions.
- Define partial-success behavior explicitly: completed assignments remain applied, and failed assignments can be retried. Do not promise transaction-wide rollback.
- Add the SDK method, regenerate OpenAPI types, and document the request and result contract.

### 3. Import an ID mapping from the devices list

Add an “Import zone mapping” action to the devices-list header, available in both list and grid views, leading to a dedicated import page.

The workflow is upload → preview → apply → results.

- Provide a downloadable CSV template with `device_id,asset_id` headers.
- Parse the CSV with support for quoted fields, UTF-8 BOM, and common line endings.
- Resolve IDs into device names and zone paths for the preview.
- Display current and proposed zones and clearly identify reassignments.
- Flag malformed rows, missing IDs, unknown resources, and conflicting duplicate assignments with row-level feedback.
- Block submission until validation errors are corrected. Revalidate resource existence on the server when applying.
- Treat blank zone IDs as errors; importing does not implicitly unlink devices.
- Show one result summary and retain failed assignments for retry.

### 4. Share mutation, validation, and result handling

Extend `useDeviceAssetLink.ts` or extract a shared batch-assignment hook so both workflows use the same mutation behavior.

- Keep parsing, validation, state management, and API calls outside rendering components.
- Use react-hook-form and zod for forms, with the existing shared field components.
- Refresh asset queries, device lists, and affected device-detail caches after changes, including partial success.
- Avoid one notification or full cache refresh per device; report the batch outcome together.
- Add English and French translations for selection, import, reassignment, validation, and results.

### 5. Verify the critical paths

UI and hook coverage:

- Multiple selection, selection across searches, and select-all behavior.
- Resetting selection on close and reopening the picker.
- Excluding already-linked devices and identifying moves from another zone.
- CSV quoting, BOM handling, malformed rows, missing or unknown IDs, and duplicates.
- Partial failures, retrying failed assignments, and refreshing all affected caches.

API and SDK coverage:

- Valid assignments, unchanged assignments, invalid resources, and conflicting duplicates.
- Partial success and safe error responses.
- Request serialization and typed response handling in the SDK.
- Endpoint permissions in the centralized authorization tests.
- Router tests that mock services, plus integration coverage with real storage for persistence behavior.

Run relevant backend, SDK, and UI tests, `prek run --all-files`, and the applicable lint, formatting, type-checking, and translation checks during implementation.

## Acceptance criteria

- A user can select several devices and link them to a zone in one action from both zone detail and edit pages.
- Searching does not discard selected devices.
- A user can upload a CSV assigning different devices to different zones using their IDs.
- The preview shows readable names, resource IDs, current zones, and proposed zones before changes are applied.
- Invalid mappings are identified before submission and resource existence is checked again when applying.
- Reassignments replace the existing zone membership; unchanged assignments are skipped.
- Results identify successful, unchanged, and failed assignments, and failures can be retried.
- Device and zone views reflect completed changes without a manual page refresh.
- Both workflows respect existing device-write permissions.

## Suggested implementation commit title

`feat(devices): add bulk zone linking and mapping import`
