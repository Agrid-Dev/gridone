## v0.89.0 (2026-06-08)

### Feat

- **ui**: add connection status badge on device (#337)

## v0.88.0 (2026-06-05)

### Feat

- connection status internal attribute AGR-645 (#335)

## v0.87.0 (2026-06-05)

### Feat

- **api**: structured JSON logging + log/trace correlation (AGR-667)
- **api**: add opt-in OpenTelemetry tracing (AGR-667)

### Refactor

- **api**: address PR review on telemetry (round 2)
- **api**: address PR review on telemetry

## v0.86.0 (2026-06-05)

### Feat

- create api endpoint to get device attribute logs (#332)

## v0.85.0 (2026-06-04)

### Feat

- **ui**: add notification automation action (AGR-563)

## v0.84.0 (2026-06-03)

### Feat

- **ui**: device-type-aware standard value renderers
- **ui**: device-type-aware standard value renderers
- **ui**: add UI for attribute value pickers list

### Fix

- **ui**: scale AttributeValueBadge icon with surrounding text
- **ui**: extract AttributeValue type, guard empty options, reuse SelectController
- address review comments

### Refactor

- **ui**: address picker review feedback

## v0.83.0 (2026-06-02)

### Feat

- options field in attribute agr-641 (#328)

## v0.82.0 (2026-06-02)

### Feat

- options codec agr-640 (#327)

## v0.81.8 (2026-06-01)

### Refactor

- **api**: enforce ANN201, ANN401, E501, S105, PLR2004 (#326)

## v0.81.7 (2026-06-01)

### Refactor

- **api**: enforce FBT001/003, PLR1711, PLR0915, RET504, A002 (#325)

## v0.81.6 (2026-06-01)

### Refactor

- **api**: enforce B904, EM102, TRY003, BLE001, S110, TRY203, SIM105 (#324)

## v0.81.5 (2026-06-01)

### Refactor

- **api**: permanently suppress TC001/TC002/TC003 — pydantic/FastAPI runtime constraint

## v0.81.4 (2026-06-01)

## v0.81.3 (2026-05-29)

### Refactor

- **api**: remove stale noqa directives, wire remaining suppressions (#319)

## v0.81.2 (2026-05-29)

### Refactor

- **api**: cleanup for FAST001 and I001 (#317)

## v0.81.1 (2026-05-29)

### Refactor

- **api**: harmonize ruff config — drop packages/api lint override (#316)

## v0.81.0 (2026-05-28)

### Fix

- **devices-manager**: make BACnet discovery work in containers (AGR-637)

## v0.80.3 (2026-05-28)

### Fix

- **devices-manager**: convert bacpypes atomic values to native Python types
- **devices-manager**: use canonical multi-state BACnet object type names

## v0.80.2 (2026-05-27)

### Refactor

- **dm**: replace multi-pass filter chain with DeviceFilters value object (#312)

## v0.80.1 (2026-05-26)

### Fix

- **api**: resolve .env from cwd so apps read their own config

## v0.80.0 (2026-05-21)

### Feat

- **ui**: read feature flags at runtime via /health
- **api**: runtime feature flags exposed on /health

## v0.79.4 (2026-05-20)

### Fix

- **ui**: use success variant for upline status badge

## v0.79.3 (2026-05-20)

### Fix

- **ui**: pluralize home page count labels via i18next

## v0.79.2 (2026-05-20)

### Fix

- **ci**: pass BUMP_TOKEN to checkout so bump tags trigger Release

## v0.79.1 (2026-05-20)

### Fix

- **ci**: drive release builds from version tag, not CI completion

## v0.79.0 (2026-05-20)

### Feat

- **ui**: flesh out building homepage with live counts and topbar label
- **ui**: building homepage placeholder and feature flag utility

## v0.78.1 (2026-05-20)

### Fix

- **api**: return 409 when single device command fails (#297)

## v0.78.0 (2026-05-19)

### Feat

- **ui**: devices list search bar

### Refactor

- **ui**: sort devices alphabetically, drop fade-up animation

## v0.77.0 (2026-05-19)

### Feat

- **devices**: add fuzzy name search to GET /devices

### Fix

- review comments addressed

## v0.76.1 (2026-05-18)

### Fix

- **ui**: preserve query params when switching device history tabs
- **ui**: align sidebar brand divider with topbar border

## v0.76.0 (2026-05-18)

### Feat

- **ui**: electricity meter standard device
- **ui**: support virtual devices
- **standard-devices**: electricity_meter backend declaration

## v0.75.0 (2026-05-18)

### Feat

- **timeseries**: wire instance-level timezone to TimeSeriesService (#282)

## v0.74.0 (2026-05-18)

### Feat

- **ui**: address PR #285 review feedback
- **ui**: lift inputs off page background and surface app version
- **ui**: hide driver id from device card header
- **ui**: polish standard-device control widgets with shared shell
- **ui**: refactor shell + design tokens to clean SaaS dashboard look

## v0.73.0 (2026-05-18)

### Feat

- **api**: add GET /{device_id}/timeseries/{attr}/aggregate endpoint (#284)

## v0.72.0 (2026-05-18)

### Feat

- **ts/storage**: implement postgres aggregate (#283)

## v0.71.0 (2026-05-12)

### Feat

- **ts/domain**: add aggregation enums, compat matrix and pydantic models (#279)

## v0.70.0 (2026-05-11)

### Feat

- **ui**: inline Networks in device flow (AGR-591)

### Fix

- **ui**: toast network save errors so the modal isn't a silent failure (AGR-591)

## v0.69.0 (2026-05-07)

### Feat

- **dm**: add waiter registry on CoreDevice and race push-confirmatio… (#276)

## v0.68.1 (2026-05-06)

### Refactor

- **devices_manager,apps**: remove easy/medium SLF001 noqa suppressions (AGR-574)

## v0.68.0 (2026-05-06)

### Feat

- **ui**: unified inline command body in the action form (AGR-529)
- **ui**: collapse the action form result to the polymorphic Action shape (AGR-529)
- **ui**: wizard owns the command template lifecycle (AGR-529)
- **commands**: add PATCH endpoint for command templates (AGR-529)

### Fix

- **ui**: icon both action source options, drop the inline-edit affordance (AGR-529)
- **ui**: wire ActionForm result through to the create-automation Submit (AGR-529)
- **commands**: make ephemeral templates addressable by id (AGR-529)

### Refactor

- **ui**: centralize asset-tree fetching in useAssetTree (AGR-529)

## v0.67.1 (2026-05-05)

### Fix

- **ui**: keep notification polling continuous in background tabs (AGR-575)

## v0.67.0 (2026-05-05)

### Feat

- **ui**: action type select on automation form (AGR-529)

### Fix

- **ui**: align automation wire shape with backend (provider_id, action)
- **ui**: make template picker reflect the user's pick (AGR-529)

## v0.66.2 (2026-05-05)

### Refactor

- **quality**: enforce ruff SLF001, silence existing violations (AGR-524)

## v0.66.1 (2026-05-05)

### Fix

- **devices-manager**: drop redundant try/except in init_listeners
- **devices-manager**: tolerate transport startup failures

## v0.66.0 (2026-05-04)

### Feat

- **ui**: add automation creation wizard (AGR-549)

## v0.65.1 (2026-05-04)

### Fix

- remove backticks from attribute name (#266)

## v0.65.0 (2026-05-04)

### Feat

- **ui**: make change_event condition mandatory and drop the toggle (AGR-551)
- **ui**: add ConditionEditor for change_event triggers (AGR-551)

### Fix

- **ui**: look up attribute dataType by name, not by dict key (AGR-551)

### Refactor

- **ui**: use a Select for bool threshold in ConditionEditor (AGR-551)
- **ui**: extract useChangeEventForm hook and resolve dataType from cache (AGR-551)

## v0.64.0 (2026-05-01)

### Feat

- **ui**: show device type icon and label in DevicePicker options (AGR-552)
- **ui**: custom change_event trigger form with device-attribute picker (AGR-552)

### Fix

- **ui**: align device name and type label on a shared baseline (AGR-552)
- **ui**: localise trigger type column in automations list (AGR-552)

## v0.63.1 (2026-04-30)

### Fix

- **ui**: final type-check stragglers
- **ui**: clean up spec type errors
- **ui**: tighten runtime types in forms, charts, and Asset model
- **ui**: clear i18n type errors

## v0.63.0 (2026-04-30)

### Feat

- **ui**: add metadata card to automation page (AGR-550) (#259)

## v0.62.1 (2026-04-30)

### Fix

- **ui**: unblock release build and prep tsconfig for type-check

## v0.62.0 (2026-04-30)

### Feat

- **ui**: wire mutations in automation edit
- **ui**: bootstrap automation create-update routes

### Fix

- **ui**: automation trigger form actions

### Refactor

- **ui**: merge automation details with form
- **ui**: fully extract automations trigger presenters to reuse in form

## v0.61.10 (2026-04-30)

### Refactor

- **automations**: migrate to common Service shape (AGR-543)

## v0.61.9 (2026-04-30)

### Refactor

- **devices_manager**: migrate to common Service shape (AGR-544)

## v0.61.8 (2026-04-30)

### Refactor

- **timeseries**: migrate TimeseriesService to common Service shape

## v0.61.7 (2026-04-30)

### Refactor

- **assets**: migrate AssetsService to common Service shape

## v0.61.6 (2026-04-30)

### Refactor

- **commands**: migrate CommandsService to common Service shape

## v0.61.5 (2026-04-30)

### Refactor

- **apps**: migrate AppsService to common Service shape

## v0.61.4 (2026-04-30)

### Fix

- **api**: use users_service.stop() in lifespan teardown

### Refactor

- **notifications**: migrate to common Service shape

## v0.61.3 (2026-04-29)

### Fix

- service inheritance

### Refactor

- **users**: migrate to common Service shape (AGR-539)
- **users**: migrate to common Service shape (AGR-539)

## v0.61.2 (2026-04-29)

### Fix

- comments

### Refactor

- **models**: add Service base, StorageError, gen_id helpers

## v0.61.1 (2026-04-28)

### Refactor

- **automations**: return trigger schemas as dict keyed by provider id

## v0.61.0 (2026-04-28)

### Feat

- **commands**: return BatchCommandDispatch and capture output_id in automations

## v0.60.0 (2026-04-28)

### Feat

- **ui**: provider-specific icons on automation trigger card
- **ui**: refine automation detail flow and executions
- **ui**: rework automation detail as a trigger -> action flow
- **ui**: row dropdown menu and description on automations list
- **ui**: automation detail with executions and delete
- **ui**: automations list view with enable/disable toggle

### Refactor

- **ui**: extract useAutomation hook, rename TRIGGER_PROVIDER_PRESENTERS

## v0.59.1 (2026-04-28)

### Fix

- attribute callbacks on change rather than on update

### Refactor

- separate attribute update listener policy

## v0.59.0 (2026-04-27)

### Feat

- **ui**: add automations route skeleton and sidebar entry
- **ui**: add automations API client

## v0.58.1 (2026-04-27)

### Refactor

- **api**: nest command-template routes under /commands/templates (AGR-533)

## v0.58.0 (2026-04-27)

### Feat

- **ui**: add global /faults triage page (AGR-467)

### Refactor

- **faults**: address PR review on /faults page

## v0.57.1 (2026-04-24)

### Fix

- **automations**: trigger register deduplication on start() (#232)

## v0.57.0 (2026-04-24)

### Feat

- **ui**: add healthy/faulty filter and card badge to device list (AGR-466)

### Fix

- **ui**: ensure device name truncates inside flex parent (AGR-466)

### Refactor

- **ui**: move health filter from client to search-param driven server-side (AGR-466)

## v0.56.0 (2026-04-23)

### Feat

- **ui**: template column + filter on commands list (AGR-512)
- **ui**: templates list + detail pages (AGR-512)
- **ui**: wizard target-mode toggle + save-as-template (AGR-512)
- **ui**: route /devices/history → /devices/commands, templates api (AGR-512)
- **api**: asset_id alias + template_id command filter (AGR-512)

### Fix

- **ui**: match the camelcased tag key when resolving by asset (AGR-512)
- **ui**: templates empty-state points to new-command, not templates/new (AGR-512)
- **ui**: commands template column + empty-state + route nesting (AGR-512)

### Refactor

- **ui**: wizard accepts a predefinedTarget instead of context flags (AGR-512)
- **ui**: template detail page uses a hook + composite presenter (AGR-512)

## v0.55.0 (2026-04-23)

### Feat

- **ui**: add Faults section to device detail page (AGR-465)

### Refactor

- **ui**: derive getActiveFaults from getAllFaultAttributes

## v0.54.0 (2026-04-23)

### Feat

- **ui**: add active faults section to device detail page
- **ui**: add active faults section to device detail page

### Refactor

- discriminate Attribute/FaultAttribute on kind

## v0.53.0 (2026-04-22)

### Feat

- **commands**: introduce CommandTemplate and template CRUD (AGR-510)

### Fix

- **commands**: repoint ts_data_points.command_id FK to unit_commands

### Refactor

- **commands**: delete_template demotes to ephemeral, does not drop the row (AGR-510)
- **api**: consolidate commands + templates into command_router (AGR-510)

## v0.52.0 (2026-04-22)

### Feat

- **ui**: add SeverityChip primitive and FaultItem component
- **ui**: add SeverityChip primitive and FaultItem component

### Refactor

- **ui**: address PR #220 review feedback on FaultItem/SeverityChip

## v0.51.0 (2026-04-21)

### Feat

- **commands**: introduce Target abstraction and TargetResolver (AGR-509)

## v0.50.1 (2026-04-21)

### Refactor

- **commands**: rename Command/group_id to UnitCommand/batch_id (AGR-508)

## v0.50.0 (2026-04-21)

### Feat

- create domain models for automation and its tests (#216)

## v0.49.0 (2026-04-21)

### Feat

- **api**: add GET /faults endpoint and is_faulty roll-up on devices (AGR-460)
- **api**: add GET /faults endpoint and is_faulty roll-up on devices (AGR-460)

### Refactor

- **api**: address PR #215 review feedback for faults slice (AGR-460)

## v0.48.0 (2026-04-21)

### Feat

- **devices-manager**: compute is_faulty property + FaultAttributeDriver (AGR-459)

### Refactor

- **devices-manager**: collapse AttributeDriver into pydantic + discriminated union (AGR-459)

## v0.47.0 (2026-04-21)

### Feat

- **devices-manager**: fork driver YAML parser on attribute kind (AGR-458)
- **devices-manager**: add FaultAttribute + FaultAttributeDriverSpec scaffolding (AGR-458)

## v0.46.0 (2026-04-20)

### Feat

- **ui**: harmonize header actions and promote "New command" (AGR-408)
- **ui**: 3-step wizard to initiate device commands (AGR-408)
- **ui**: turn commands list into a progress view (AGR-408)
- **api**: accept device_type on batch command dispatch (AGR-408)

### Fix

- **ui**: address review feedback on command dispatch (AGR-408)

## v0.45.1 (2026-04-16)

### Fix

- **devices-manager**: fix mqtt control integration test
- devices manager device control integration tests not collected

## v0.45.0 (2026-04-16)

### Feat

- API endpoints for grouped commands (AGR-407)

## v0.44.0 (2026-04-16)

### Feat

- recursive subtree

### Refactor

- address PR #205 review

## v0.43.0 (2026-04-15)

### Feat

- add filter compatibility method for a given command (#206)

## v0.42.0 (2026-04-14)

### Feat

- added commands package

### Fix

- reviews addressed
- run commands migrations in timeseries integration tests
- remove test __init__.py files causing namespace collision
- resolve pre-push hook failures
- migrations compatible with postgres

### Refactor

- address pre-push review findings

## v0.41.3 (2026-04-14)

### Fix

- add confirm flag on driver attributes (#204)

## v0.41.2 (2026-04-09)

### Refactor

- drop DTO suffix from public models

## v0.41.1 (2026-04-09)

### Refactor

- give registries ownership of their persistence

## v0.41.0 (2026-04-09)

### Feat

- build inside release workflow

## v0.40.2 (2026-04-09)

### Fix

- **ci**: integrate release into CI workflow, eliminate cross-workflow polling

## v0.40.1 (2026-04-09)

### Fix

- **ci**: look for CI run on merge commit, not bump commit

## v0.40.0 (2026-04-09)

### Feat

- **devices_manager**: move sync lifecycle into Device, thin out facade

### Fix

- **devices_manager**: use resolver callables in DeviceRegistry constructor

## v0.39.1 (2026-04-09)

### Fix

- **ci**: trigger release workflow from bump via workflow_dispatch

## v0.39.0 (2026-04-09)

### Feat

- **devices_manager**: extract DeviceRegistry from DevicesManager

### Refactor

- **tests**: clean up DevicesManager tests, mock DeviceRegistry

## v0.38.1 (2026-04-09)

### Fix

- **devices_manager**: agr-412 raise InvalidError instead of ValueError in value adapter factory (#190)

## v0.38.0 (2026-04-09)

### Feat

- **devices_manager**: extract TransportRegistry and DriverRegistry from DevicesManager

### Fix

- keep DevicesManager public API unchanged
- rename registry list -> list_all to avoid shadowing builtin

## v0.37.0 (2026-04-08)

### Feat

- agr-410 create knx dpt value adapter (#187)

## v0.36.1 (2026-04-08)

### Fix

- **docker**: enable gzip compression in nginx

## v0.36.0 (2026-04-08)

### Feat

- **devices_manager**: register KNX transport in factory and DTO
- **devices_manager**: add KNX/IP transport client

### Fix

- add guard when not connected for consistency

## v0.35.0 (2026-04-08)

### Feat

- added release workflow

## v0.34.3 (2026-04-08)

### Refactor

- clean up transport hierarchy with explicit pull/push taxonomy

## v0.34.2 (2026-04-07)

### Fix

- resolve ty type-check error in DiscoveryManagerInterface

### Refactor

- rewrite router tests to mock DevicesManagerInterface
- update API layer to depend on DevicesManagerInterface protocol
- define DevicesManagerInterface and DiscoveryManagerInterface protocols

## v0.34.1 (2026-04-07)

### Refactor

- extract timeseries routes into a child router

## v0.34.0 (2026-04-07)

### Feat

- **ui**: update timeseries API client and hooks to new endpoint paths
- **api**: migrate timeseries read endpoints under /devices

### Fix

- restore hook behaviour

## v0.33.0 (2026-04-03)

### Feat

- virtual devices timeseries history push endpoints (AGR-383)

## v0.32.0 (2026-04-03)

### Feat

- **devices-manager**: attribute persistence

### Fix

- **ci**: pin ruff and ty versions, add version echo step

### Refactor

- **devices-manager**: centralize attribute update handlers and persist on change

## v0.31.1 (2026-04-02)

### Refactor

- **devices-manager**: register asyncpg jsonb codec
- **devices-manager**: refactor postgres storage to prepare attribute persistence

## v0.31.0 (2026-04-02)

### Refactor

- **ui**: split i18n locales files

## v0.30.0 (2026-04-01)

### Feat

- added gridone version in sidebar

## v0.29.0 (2026-04-01)

### Feat

- removed refresh buttons

## v0.28.0 (2026-03-31)

### Feat

- pre-push skill
- enable basic configuration for app

### Fix

- address PR #166 review feedback
- type-safe kwargs, useMemo schema, 5xx→502, no URL leak in errors

## v0.27.4 (2026-03-29)

### Fix

- **docs**: side bar and small layout issues on mobile

## v0.27.3 (2026-03-27)

### Refactor

- **docs**: refactor home page with a hero section

## v0.27.2 (2026-03-27)

### Refactor

- **ui**: redesign with warm amber / deep navy theme

## v0.27.1 (2026-03-26)

### Fix

- changed assets directory to avoid conflicting with gridone assets

## v0.27.0 (2026-03-26)

### Feat

- **ui**: standard weather_sensor device

### Fix

- **ui**: address pr comments

### Refactor

- **ui**: split translations i18n

## v0.26.0 (2026-03-26)

### Feat

- **devices-manager**: standard weather_sensor device

## v0.25.0 (2026-03-25)

### Feat

- ui for app registration flow

### Fix

- ui comments

## v0.24.1 (2026-03-24)

### Fix

- sync --all-packages to install workspace deps before generating OpenAPI spec (#154)

## v0.24.0 (2026-03-24)

### Feat

- **api**: healh endpoint (#153)
- **api**: healh endpoint

## v0.23.0 (2026-03-23)

### Feat

- app registration flow after validation

### Fix

- comments
- pr review
- added tests to match
- prek
- tests

## v0.22.1 (2026-03-22)

### Fix

- additional examples added for transport addresses (#149)

## v0.22.0 (2026-03-21)

### Feat

- **ui**: standard awhp controls

### Refactor

- **ui**: remove previous value in thermostat control success toast

## v0.21.1 (2026-03-20)

### Fix

- **ui**: thermostat control feedback toast previous value

### Refactor

- **ui**: refetch device list every 10s

## v0.21.0 (2026-03-20)

### Feat

- mapping adapter with expected arg handling (#144)

## v0.20.0 (2026-03-20)

### Feat

- **ui**: loading state animations in standard thermostat control
- **ui**: thermostat control
- **ui**: introduce standard devices and thermostat preview

### Refactor

- **ui**: device type enum and removed circular imports

## v0.19.0 (2026-03-20)

### Feat

- updated claude.md

## v0.18.1 (2026-03-20)

### Fix

- accept int values where float is expected in timeseries validation

## v0.18.0 (2026-03-19)

### Feat

- registration and apps package

### Fix

- comments
- precommit
- codecov
- resolve test collection errors in CI for apps package

## v0.17.0 (2026-03-18)

### Feat

- **ui**: handle empty state with filters
- **ui**: filter bar and type filter for devices and drivers list
- **ui**: add device type chips

### Refactor

- **ui**: rework, fix and simplify device preview card

## v0.16.0 (2026-03-18)

### Feat

- **api**: type filter in list devices and list routers and get standard schemas
- **devices-manager**: add filters for list devices / drivers
- **devices-manager**: pass type through dto

## v0.15.0 (2026-03-18)

### Feat

- block users

### Fix

- pr comments

## v0.14.0 (2026-03-17)

### Feat

- add type field to distinguish users from service accounts

## v0.13.0 (2026-03-17)

### Feat

- **devices-manager**: enforce type schema at driver level and add type as property on device
- **devices-manager**: introduce standard devices registry
- **devices-manager**: schema validator for standard attributes

### Refactor

- **devices-manager**: address pr comments

## v0.12.0 (2026-03-16)

### Feat

- add footer with links (#130)

## v0.11.0 (2026-03-16)

### Feat

- create homepage with product details (#129)

## v0.10.2 (2026-03-13)

### Fix

- **logs**: update handlers for production and remove connection errors tracebacks

## v0.10.1 (2026-03-13)

### Fix

- **types**: fix python type issues after ty upgrade

### Refactor

- **types**: use coroutine/create_task instead of awaitable/ensure_future

## v0.10.0 (2026-03-13)

### Feat

- polish global ui layout

### Fix

- padding top refactored

## v0.9.1 (2026-03-12)

### Fix

- **storage**: add max pool size param and close connections on app shutdown

## v0.9.0 (2026-03-12)

### Feat

- replace ensure_schema() with yoyo-migrations across all packages

### Fix

- use DELETE instead of DROP in timeseries test fixture for yoyo compatibility

### Refactor

- move run_migrations() into each package and decouple api from storage internals

## v0.8.1 (2026-03-11)

### Fix

- added python-multipart

## v0.8.0 (2026-03-11)

### Feat

- changed display_name to name to make it retro-compatible
- add role-based access control (RBAC) with admin/operator/viewer roles

### Fix

- pin uv 0.10.9 in CI, pin ty==0.0.1a25, fix duplicate import
- AttributeUpdate imports

### Refactor

- fixes for authorization feature

## v0.7.0 (2026-03-10)

### Feat

- **ui**: display a user avatar with command info next to resulting time series value
- **timeseries**: query commands by ids

### Refactor

- **timeseries**: mutualize query model in get commands

## v0.6.0 (2026-03-10)

### Feat

- OAuth2 compliance with refresh tokens and httpOnly cookies

## v0.5.1 (2026-03-09)

### Fix

- png and csv export bug (#113)

## v0.5.0 (2026-03-09)

### Feat

- **ui**: device commands history

## v0.4.0 (2026-03-09)

### Feat

- **ui**: commands history table

### Refactor

- **timeseries**: refactor use commands hook to use pagination links

## v0.3.0 (2026-03-05)

### Feat

- **timeseries**: support for sorting commands by timestamp

## v0.2.1 (2026-03-05)

### Fix

- persist discovered devices to storage

## v0.2.0 (2026-03-05)

### Feat

- use BUMP_TOKEN
- **api**: pagination
- **timeseries**: add a get_commands method with filters
- **timeseries**: log device commands through api
- png export for timeseries (#90)
- add download button for timeseries (#89)
- **timeseries**: device command model and storage
- added pre-hook
- create export method in TS service for csv (#86)
- gridone support for fil pilote to decode and encode message (#85)
- **timeseries**: carry-forward
- **UI**: time range selector for device history
- **api**: plug storage url to enable postgres storage in timeseries
- **timeseries**: postgres storage driver / CI integration test
- **timeseries**: postgres storage driver
- **UI**: time series chart - common tooltip and format
- **UI**: charts handle strings
- **UI**: charts handle bools
- **UI**: device history chart view (line chart for now - floats only).
- assets comments
- creation / deletion / edition of assets with ui
- resolving pr comments
- changed auth to belong to users package
- working login/logout + add user
- **ui**: plug websocket for live history
- **ui**: time series basic history table
- **ui**: time series client method and hook
- docker folder
- docker image with nginx server
- **devices-manager**: parse name from config on discovery
- add byte converter to support multiple data types
- added nested storage and kept yaml storage capabilities
- **core**: initialize attributes on discovery if found in payload
- switch for the discovery  on the transport modification page
- discovery ui
- **api**: discovery api
- **core**: add device to manager on discovery
- **core**: devices discovery manager instanciates a device on discovery
- **UI**: update device
- device creation
- blank page to add a device - with routing
- **UI**: driver deletion
- **UI**: add empty state for devices
- **UI**: confirm button
- **UI**: feedback toasts
- **UI**: driver create form
- **API**: support driver creation from yaml payload
- **UI**: empty states
- **UI**: show driver
- **UI**: list drivers
- **dto**: device DTO
- **core**: add new field on attribute, last_changed != last_updated
- extracted socket logic
- added socket manager in ui and back
- ui with shadcn
- bool format value parser
- **core**: handle polling disabled
- update stratgy
- **api**: write attribute
- hooks
- device-card updated chip
- add ui application
- changed mqtt message to yaml structure (#11)
- set_point http write (#6)
- **core**: modbus-tcp transport

### Fix

- **timeseries**: deserialize command values
- **api**: post-rebase conflict fix
- **api**: fix review comments - improve error handling for write attribute
- **ui**: string and bool panels not displayed
- changed the createDriver in the ui
- ci
- ci tests failures
- tests
- AuthPayload pydantic
- type and ruff errors
- **devices-manager**: restart polling on device update
- remove fixture + file name
- **ui**: fix transport label
- **tests**: fix thermocktat config in mqtt integration test
- **tests**: fix container shutdown in integration tests
- **core**: fix bacnet application closure
- **UI**: devices actions - casing issues
- locales
- **core**: allow 0 modbus for modbus instances
- imports ordering check
- PR comments
- cache invalidate on register new topic handler

### Refactor

- **api**: delete unused util gen_id
- **api**: confirm value in the return body of update attribute endpoint
- **timeseries**: use an enum for command status
- **timeseries**: use enums in storage for data_type and status
- **models**: mutualize attribute value type model
- rewrite the script in typescript
- **timeseries**: handle edge case for socket updates
- **timeseries**: move last query param to backend
- **UI**: extract charts float precision as variable, and cap number of string values to 10
- **UI**: split time series chart and add tests
- **UI**: factorize TimeSeriesChart
- **ui**: polish history table
- **ui**: devices routes nesting
- **api**: use exception handlers
- **devices-manager**: make dm own its storage
- **devices_manager**: make devices private
- **devices-manager**: make transports private
- **device-manager**: apply CRUD methods with dto on drivers
- **devices-manager**: devices manager takes ownership of its storage
- **core**: develop core in devices-manager
- **storage**: merge into devices-manager
- **dto**: merge into device manager
- **core**: rename core -> devices_manager
- **ui**: adapt to new discovery handler api schema
- **api**: list all available discovery configs with enabled boolean
- **core**: expose discovery manager directly from devices manager
- **discovery**: remove legacy method from driver and refactor cli
- **core**: devices discovery manager
- **core**: task registry for devices manager
- **UI**: add defaults titles for fallbacks
- **UI**: use camelCase keys
- **core**: refactor value parsers to chainable value adapters
- **core**: stricter type casting for attributes
- **mqtt**: fallback to primary templating markup (#10)
- **mqtt**: fallback to primary templating markup
