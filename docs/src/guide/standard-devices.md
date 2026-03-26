# Standard Devices

Gridone is designed to drive **any** device through its extensible driver system. However, some device categories are so common in buildings (thermostats, heat pumps, weather stations...) that they deserve first-class support.

**Standard devices** are devices whose driver declares a `type` matching one of the registered standard schemas. When a driver has a type, Gridone enforces that its attributes conform to the expected schema — giving you a consistent data model and a purpose-built UI out of the box.

## How it works

### Driver type declaration

A driver opts into a standard type by setting the `type` field:

```yaml
id: my-thermostat-driver
vendor: Acme
model: T-1000
transport: mqtt
type: thermostat          # ← declares this driver as a standard thermostat

attributes:
  - name: temperature
    data_type: float
    # ...
```

### Schema validation

When a driver is registered with a `type`, Gridone validates its attributes against the corresponding standard schema:

- **Required attributes** must be present with the correct name and data type.
- **Optional attributes** may be omitted, but if present they must match the expected data type.
- Drivers may define **additional attributes** beyond the standard schema — the schema only constrains what must exist, not what can exist.

Validation runs at driver registration time. If an attribute is missing or has the wrong type, the driver is rejected with a clear error message.

### Multiple-instance attributes

Some standard schemas support **multiple-instance** attributes — useful for devices with repeated components (e.g., multiple compressors in a heat pump). These attributes use a suffix convention:

- Numeric suffix: `compressor_suction_temperature_1`, `compressor_suction_temperature_2`
- Alphabetic suffix: `compressor_suction_temperature_A`, `compressor_suction_temperature_B`

The schema field defines the base name; the driver provides suffixed variants.

### Built-in UI

Standard devices get dedicated graphical representations in the Gridone UI, with both a **preview card** (shown in device lists) and a **control panel** (shown in device detail). These display device data using domain-specific visuals rather than generic attribute tables.

Non-standard attributes are still accessible through the generic attribute view.

## Standard device types

The following standard types are currently registered.

---

### Thermostat

**Key:** `thermostat`

A climate control device that reads ambient temperature and allows setting a target temperature within configurable bounds.

| Attribute | Data type | Required | Description |
|---|---|---|---|
| `temperature` | float | yes | Current ambient temperature |
| `temperature_setpoint` | float | yes | Desired target temperature |
| `temperature_setpoint_min` | float | yes | Minimum allowed setpoint |
| `temperature_setpoint_max` | float | yes | Maximum allowed setpoint |
| `onoff_state` | bool | yes | Power on/off state |
| `mode` | string | yes | Operating mode (e.g., heating, cooling, auto) |
| `fan_speed` | string | no | Fan speed setting |

**UI behavior:** The control panel displays the current temperature and setpoint, with increment/decrement controls that respect the min/max bounds. Mode and power state are also shown and controllable.

---

### Air-to-Water Heat Pump (AWHP)

**Key:** `awhp`

An air-to-water heat pump with water-side metrics and optional refrigerant circuit monitoring.

| Attribute | Data type | Required | Multiple | Description |
|---|---|---|---|---|
| `onoff_state` | bool | yes | no | Operating state |
| `unit_run_status` | string | yes | no | Run status (e.g., running, idle) |
| `mode` | string | yes | no | Operating mode |
| `inlet_temperature` | float | yes | no | Water inlet temperature |
| `outlet_temperature` | float | yes | no | Water outlet temperature |
| `setpoint_temperature` | float | yes | no | Target water temperature |
| `outdoor_temperature` | float | no | no | Ambient outside temperature |
| `compressor_suction_temperature` | float | no | yes | Refrigerant suction temperature |
| `compressor_suction_pressure` | float | no | yes | Refrigerant suction pressure |
| `compressor_discharge_temperature` | float | no | yes | Refrigerant discharge temperature |
| `compressor_discharge_pressure` | float | no | yes | Refrigerant discharge pressure |
| `condenser_saturated_refrigerant_temperature` | float | no | yes | Condenser saturated temperature |
| `condenser_refrigerant_pressure` | float | no | yes | Condenser pressure |
| `evaporator_saturated_refrigerant_temperature` | float | no | yes | Evaporator saturated temperature |
| `evaporator_refrigerant_pressure` | float | no | yes | Evaporator pressure |

Attributes marked **Multiple = yes** support suffixed instances (e.g., `compressor_suction_temperature_1`, `compressor_suction_temperature_A`) for multi-circuit or multi-compressor units.

**UI behavior:** The control panel displays a schematic of the refrigerant circuit (evaporator, compressor, condenser, expansion valve) with live temperature and pressure values, plus water-side metrics (inlet, outlet, setpoint).

---

### Weather Sensor

**Key:** `weather_sensor`

An outdoor weather station providing ambient conditions data.

| Attribute | Data type | Required | Description |
|---|---|---|---|
| `temperature` | float | yes | Ambient temperature (°C) |
| `weather_code` | int | yes | WMO weather interpretation code (0–99) |
| `wind_speed` | float | yes | Wind speed (km/h) |
| `wind_direction` | int | yes | Wind direction in degrees (0–360) |
| `humidity` | float | yes | Relative humidity (%) |

**UI behavior:** The control panel displays the weather condition with an icon derived from the WMO code, a prominent temperature reading, wind speed with compass direction, and humidity.
