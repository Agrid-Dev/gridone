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
