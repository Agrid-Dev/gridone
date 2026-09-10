# General Layout

A [driver](../glossary.md#driver) is a YAML file. Below is the full structure with all supported fields.

```yaml
id: <string>                  # (required) unique identifier for this driver

# Optional metadata
vendor: <string>              # equipment vendor / manufacturer
model: <string>               # device model name
version: <int>                # driver version
image_src: <string>           # URL or base64 image of the device — recommend square, 400×400
type: <string>                # standard device type (e.g. thermostat, awhp, weather_sensor)

transport: <protocol>         # (required)

env:                          # (optional) driver-scoped constants, reusable across attributes
  BASE_URL: "http://example.com/api"

device_config:                # (optional) parameters the user must supply per device instance
  - name: ip                  # e.g. IP address, device ID — interpolated as ${ip} in addresses

update_strategy:              # (optional) controls how often attributes are polled
  polling_interval: 30s       # or: polling: disable
  # or, named polling groups with per-group intervals:
  # polling_groups:
  #   core: 10s
  #   config: 1h

healthcheck:                  # (optional) controls how device liveness is assessed
  expected_push_interval: 30s

attributes:                   # (required) list of attribute drivers
  - name: temperature         # attribute identifier
    data_type: float          # float | int | bool | str
    read: ...                 # transport address for reading — see Transport Addresses
    write: ...                # transport address for writing — omit if read-only
    # or:
    read_write: ...           # shorthand when read and write share the same address
    polling_group: core       # (optional) which update_strategy.polling_groups entry polls this attribute
    push: false               # (optional) subscribe instead of poll — only consulted on hybrid pull+push transports (e.g. opcua)

    # Codecs (optional) — applied in order on read, reversed on write, if reversible
    codecs:
      - json_pointer: /path       # extract a value from a JSON payload
      - byte_convert: float32 big_endian

    # Presentation metadata (optional) — shown as-is by clients, never interpreted
    label:                      # display name; `default` is required, translations are keyed by language tag
      default: Setpoint
      translations: { fr: Consigne }
    description:                # same shape as label
      default: Requested room temperature
    group: setpoints            # snake_case key grouping related attributes together
    unit: °C                    # free unit symbol (°C, %, W, kWh, m³/h)

    # Write constraints (optional, int/float attributes only) — enforced on every write
    write_constraints:
      step: 0.5                 # accepted values sit on a grid anchored at 0 (21.5 ok, 21.3 refused)
      minimum: { attribute: temperature_setpoint_min }   # a sibling attribute's current value...
      maximum: 30               # ...or a constant; both bounds are inclusive
```

## Presentation

`presentation:` (optional) declares how the device page is composed — sections, controls, measurements and a graphic replica of the device screen — as data rendered by Gridone's generic widgets. See [Device Presentations](../device-presentations.md).

## Field reference

| Field | Required | Description |
|---|---|---|
| `id` | yes | Unique driver identifier |
| `transport` | yes | Protocol used to communicate with the device |
| `vendor` | no | Equipment vendor name |
| `model` | no | Device model name |
| `version` | no | Driver version number |
| `image_src` | no | URL or base64-encoded image of the physical device. Shown in the UI driver list and detail page. Recommended: square image, 400×400 px |
| `type` | no | Standard device type — enables schema validation and built-in UI. See [Standard Devices](../standard-devices.md) |
| `env` | no | Driver-scoped constants |
| `device_config` | no | Per-instance parameters (e.g. `ip`, `device_id`). See [Device config](../glossary.md#device-config) |
| `update_strategy` | no | Polling frequency configuration. See [Update strategy](../glossary.md#update-strategy) |
| `healthcheck` | no | Device liveness configuration. See [Health check](../glossary.md#health-check) |
| `attributes` | yes | List of readable/writable [attributes](../glossary.md#attribute) |
| `discovery` | no | Auto-[discovery](../glossary.md#discovery) configuration (protocol-dependent) |

Each attribute under `attributes` must declare a `name`, a `data_type`, and at least one of `read`, `write`, or `read_write`. See [Attribute Drivers](#attribute-drivers) for full details.

### Attribute metadata

Every attribute may carry optional presentation metadata. It is stored with the driver, copied verbatim onto each device's attributes in the API, and never interpreted by Gridone.

| Field | Description |
|---|---|
| `label` | Display name. An object with a required `default` (1–200 characters) and optional `translations` keyed by language tag (`fr`, `en`, `fr-CA`). Clients resolve the exact tag, then the base language, then `default` |
| `description` | Longer help text, same shape as `label` |
| `group` | snake_case key (`^[a-z][a-z0-9_]*$`, 64 characters max) grouping related attributes together |
| `unit` | Free unit symbol, 1–16 characters (`°C`, `%`, `W`, `kWh`, `m³/h`). Gridone has no unit nomenclature yet: the symbol is displayed as-is |

### Write constraints

`write_constraints` declares the values a writable `int` or `float` attribute accepts. Declare at least one of the three keys:

| Key | Description |
|---|---|
| `step` | Positive number, or `{ attribute: <name> }` to use the current value of another `int`/`float` attribute (a device's configurable precision). Accepted values are whole multiples of `step`, counted from 0 — not from `minimum`. With `step: 0.5`, `21.5` is accepted and `21.3` refused |
| `minimum` | Inclusive lower bound: a number, or `{ attribute: <name> }` to use the current value of another `int`/`float` attribute of the same driver |
| `maximum` | Inclusive upper bound, same forms as `minimum` |

```yaml
  - name: temperature_setpoint
    data_type: float
    read_write: HR0
    write_constraints:
      step: 0.5
      minimum: { attribute: temperature_setpoint_min }
      maximum: 30
```

The service enforces these constraints on **every** write — UI, API commands, CLI and automations alike — before anything reaches the device. A write whose referenced step or bound is unknown (the attribute has no value yet, or is missing on the device), or whose referenced step is not positive, is refused rather than let through unchecked.

Constraints are validated when the driver is loaded or edited: a constraint on a non-numeric attribute, a bound referencing a missing or non-numeric attribute, or a self-reference is rejected. Renaming a referenced attribute updates the references that point at it; deleting one is refused while another attribute still bounds itself on it.
