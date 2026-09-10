# Annex A — Firmware inventory (Agrid thermostat) for the driver-defined device UI

Status: firmware code inventory complete (2026-09-09); all ten hardware checks remain pending. Sources are the firmware working tree at
`/Users/bastien/code/Agrid/thermostat` (no build/hardware was exercised — see §6).

This inventory records the initial driver snapshot; “missing” mappings below describe
that snapshot, not the delivered pilot package. The current package contains 159
attributes at `gridone-setup/src/services/fixtures/drivers/agrid_thermostat_mqtts/driver.yaml`
(commit `0fe40451725d3face899f93bc4ab2eeb2e2d3947`). Its additional mappings do not
prove firmware behaviour. See the [local validation report](driver-defined-device-ui-validation.md)
for implementation, tests, known limitations and the remaining gate.

Path abbreviations used in historical citations:

| Abbrev. | Path |
|---|---|
| `FW/` | `/Users/bastien/code/Agrid/thermostat/application/project/AT32_IDE/middlewares/` |
| `APP` | `/Users/bastien/code/Agrid/thermostat/application/project/src/freertos_app.c` |
| `VARS` | `/Users/bastien/code/Agrid/thermostat/readme_variables.md` (generated doc; line numbers of the table rows) |
| `DRV` | `/Users/bastien/code/Agrid/gridone-setup/src/services/fixtures/drivers/agrid_thermostat_mqtts.yaml` |

Where the generated readme and the code disagree, the code wins and the disagreement is called out
(marked **README≠CODE**).

---

## 1. How to read this annex

**Variable model.** The firmware exposes one flat table, `DATA_TABLE[VALUE_ID_COUNT]`
(`FW/data/data_values.c:562`), 255 entries. Each entry is `{name, value*, type, flash*, default, acl}`
(`FW/data/data_values.h:1068-1076`). Entries before `MagicWord` are runtime (`data_.rt`), the rest are
configuration (`data_.conf`, persisted to flash) — `mqtt_read_data` uses that split for `RT` / `CONF`
(`FW/lwesp/mqtt_application.c:531-545`). The same variable *name* is used on MQTT, HTTP and Modbus (`VARS:10-16`).
A variable's wire name is the `*_NAME` string in `data_values.c`, which can differ from the C field: the
watchdog reboot counter is field `Reboot_Count` but wire name `Reboot_Count_UTC` (`FW/data/data_values.c:49`).

**Types on the wire (MQTT JSON).** Serialisation is done in `mqtt_send_data` (READ_DATA replies,
`FW/lwesp/mqtt_application.c:432-470`) and `mqtt_post_data_enum` (on-change pushes, `:1893-1937`), identically:

| Firmware type | JSON `value` | Example | Notes |
|---|---|---|---|
| `boolean` | JSON `true` / `false` | `true` | |
| `int32` | JSON integer | `-57` | `HVAC_Mode`, `BackLight`, timestamps, `RSSI` |
| `fxp1000` | **JSON number in real units** (decimal string produced by `fxp_to_str`, `FW/utils/math_utils.c:19-45`) | `21.5` | NOT ×1000 on the wire: 21500 internally ⇒ `21.5`. Writes: a JSON int is `INT2FXP`'d, a JSON real is `FLOAT2FXP`'d (`mqtt_application.c:642-648, 684-690`). `FXP1000_NAN` (= `INT_MIN`, `math_utils.h:52`) serialises as `-2147483.648` — treat that as "invalid". |
| `float` | JSON number (`%f`) | `-1.000000` | `DI_1/DI_2`, coefficients |
| `enum` | **quoted enumerator name** | `"FAN_SPEED_LOW"` | Never an integer: the `default:` branch calls `get_enum_value` (`mqtt_application.c:466-470`, `:1926-1934`). Writes must also be the name: `mqtt_write_data_other` scans `get_enum_value` for a string match (`:748-770`); a JSON integer sent for an enum is rejected (`mqtt_write_data_int` only accepts INT32/FLOAT/FXP1000, `:622-650`) and logs `EVENT_DATA_BAD_VALUE` (`:869-875`). |
| `char` | quoted string (≤ 31 chars) | `"Room 201"` | |
| `version` | quoted `"A.B.C"` (`get_version_value`, `FW/data/data_values.c`) | `"1.4.12"` | stored as int32 `(A<<24)|(B<<16)|C` |

**Exception worth remembering:** `HVAC_Mode` is an `int32` (index), not an enum (`FW/data/data_values.c:577`);
`HVAC_Real_Mode`, `HVAC_Mode_0..9` and `ChangeOver_HVAC_Mode_*` are enums (names).

**Message shapes.**
- Commands are published on topic `<MAC>` (12 uppercase hex chars, e.g. `8CCE4EF42AD5`, README examples
  `/Users/bastien/code/Agrid/thermostat/README.md:818-824`); the device also subscribes `<MAC>/+` for
  `/user` `/admin` `/sadmin` privilege levels (`FW/lwesp/mqtt_application.c:1565-1575`).
- READ_DATA `{"command":"READ_DATA","data":"<Name>|ALL|RT|CONF"}` is answered on `updData/<MAC>` (base level)
  with `{"mac","ip","ts","data":[{"name","type","acl","value"}, …]}` — **at most 3 variables per message**
  (`MAX_MQTT_DATA_SENT`, `:395`), so `ALL` arrives as ~85 messages. `ts` = device `Timestamp_UTC` at send time.
- On-change pushes have the same shape plus `"magic"` and carry exactly **one** variable per message
  (`:1871-1972`); `ts` is the time the change was logged. They go to the topic of the variable's `read_min`
  level (`:1965-1971`); every variable relevant to this UI has `read_min = 0` (no `read_min` set anywhere in
  `data_values.c`) ⇒ always `updData/<MAC>`.
- `acl` is a compact string `r<read_min>w<write_min>m<no_maint>` (`FW/data/data_values.c:1735-1751`), e.g. `"r0w4m0"`
  means read by all, never writable (`ACL_NEVER`).

**Push pipeline (what "echo" means below).** Any code path that calls `save_data_log(id, ts, value)`
(`FW/flash/flash_log.h:81`) appends an entry to the flash log; `flashReadTask` polls it every 10 ms
(`APP:1036-1072`, 1 s back-off when empty) and publishes each entry through `mqtt_post_data_enum`
(`FW/flash/flash_log.c:366-400`). Every external write ends with a generic `save_data_log(value)` at the end of
`execute_value_actions` (`FW/data/data_actions.c:853`) — **so the device echoes each accepted write** — and
firmware-internal corrections publish explicitly (see §5). Latency is bounded by the MQTT publish rate limiter
(token bucket, `mqtt_application.c:1457-1470`) — typically well under a second.

**Timestamps.** All `*_Timestamp` and `Timestamp_UTC` values are **Unix epoch seconds (UTC)**: `get_timestamp()`
returns `data_.rt.Timestamp_UTC` (`FW/features/timestamp/timestamp.c:6-9`), which NTP sets from
`tm_to_epoch_utc` (days-from-civil relative to 1970, `FW/features/time_sync/time_sync.c:37-49`) and which is
floored at the firmware build epoch (`timestamp.c:30-62`). **README≠CODE**: `VARS:101` says "since 1 Jan 2020"
and `VARS:161-186` say "since 1 Jan 2025" — both wrong.

**Builds.** Variables flagged "_Absente du build MINIMAL_" in `VARS` do not exist in the MINIMAL (bootloader-
like) firmware; `Boot_Mode` (`BOOT_MODE_NORMAL|FAKE_MINIMAL|MINIMAL`, `VARS:88`) tells which build/mode is
running. In MINIMAL / fake-minimal, writes only log+persist, no actions run (`FW/data/data_management.h:31-35`).

**Screen vocabulary.** The physical screen has an ON screen (`FW/lvgl_ui/main_ui.c`) and an OFF screen
(`FW/lvgl_ui/off_ui.c`, a single OFF glyph button + 4 invisible corner buttons, `:218-239`). Backlight dims
after `Time_Delay_Screensaver` but the ON content does not change (§A9).

---

## 2. Matrix

Column "Driver?" = attribute name in `DRV` (the current Gridone driver), or **no**.
Access is the effective code ACL (`{.write_min = ACL_NEVER}` ⇒ `r`); `rw*` = writable in code although
`VARS` documents it as `r`.

### A — Device-face replica

#### A1. Measured indoor temperature (top line, left slot)

| Need | Firmware variable | Type | Access | Enum values / unit / range | Driver? | Notes |
|---|---|---|---|---|---|---|
| Value shown | `Temperature` | fxp1000 | r | °C, always (screen converts); `FXP1000_NAN` when sensor invalid | `temperature` | Treated value = raw×coeff + CPU×coeff + constant (`FW/adc/filtering_inputs.c:88-130`), recomputed every 1 s (`APP:838-866`, period `FW/adc/filtering.h:11`). On MQTT it is **not** rounded; the screen rounds it. Pushed on change only when the change exceeds `Temperature_Precision` (`FW/adc/filtering.c:12-35`, `APP:872`). |
| Display precision | `Temperature_Precision` | fxp1000 | rw | whitelist 0.1 / 0.2 / 0.5 / 1 (`FW/data/config_values_limits.c:7`, validated `config_validation.c:685`), default 0.5 | **no** | Screen prints `ROUND_INT_CLOSEST_TO(value, precision)`; integer precision ⇒ no decimals (`FW/lvgl_ui/top_line.c:228-239`). Also the on-change push threshold (above). |
| Printed at all? | `Print_Indoor_Temperature` | boolean | rw | default **false** (`VARS:231`) | **no** | Element registered `FW/lvgl_ui/main_ui.c:1045-1056`; hidden unless `print && valid` (`top_line.c:61, 213-226`). |
| Validity limits | constants (not variables) | — | — | 5.0 °C ≤ T ≤ 50.0 °C (`FW/utils/constants.h:13-14`) | — | Out of range or NAN ⇒ slot hidden (`top_line.c:213-226`). In °F the same limits are converted (`:192-198`). |
| Unit label | `Temperature_Unit` | enum | rw | see A6 | `temperature_unit` | `°F` for `TEMPERATURE_UNIT_F` / `_F_ONLY`, else `°C` (`top_line.c:75-90`). |
| Layout | `Portrait`, `Top_Element_Refresh` | boolean / int32 | rw / — | `Top_Element_Refresh` ms, default 5000 | **no** | Two slots only (temperature left, humidity right, centred if one) (`top_line.c:116-179`). `Top_Element_Refresh` gates refresh rate (`:256-268`) — **README≠CODE**: `VARS:496` marks it "non implantée". |

#### A2. Measured humidity (top line, right slot)

| Need | Firmware variable | Type | Access | Enum values / unit / range | Driver? | Notes |
|---|---|---|---|---|---|---|
| Value shown | `Humidity` | fxp1000 | r | % RH, clamped 0..100 or NAN (`FW/adc/filtering_inputs.c:33-62`) | `humidity` | Pushed when change > `Humidity_Precision` (`APP:870`). |
| Display precision | `Humidity_Precision` | fxp1000 | rw | whitelist in `config_values_limits.c:9`, default 5 (`VARS:307`) | **no** | Same rounding rule as A1. |
| Printed? | `Print_Humidity` | boolean | rw | default **false** (`VARS:232`) | **no** | Element `main_ui.c:1058-1069`. |
| Validity | constants | — | — | 0 ≤ H ≤ 100 (`constants.h:17-18`) | — | Unit fixed `%`. |

#### A3. Green leaf

| Need | Firmware variable | Type | Access | Values | Driver? | Notes |
|---|---|---|---|---|---|---|
| Leaf visible | `Print_Green_Leaf` | boolean | rw | default false | **no** | Pure configuration flag: the only reader is `update_ui_greenLeaf_display` (`main_ui.c:565-579`, glyph created `:1085`); nothing in the firmware computes it from the saving features (grep: no other reader/writer). The server decides. Top-right, 22 px (`:886-887`). |

#### A4. ON/OFF

| Need | Firmware variable | Type | Access | Values | Driver? | Notes |
|---|---|---|---|---|---|---|
| State | `State` | boolean | rw (refused while `Maintenance_Mode`, `.no_maint=1`, `FW/data/data_values.c:576`, `:1690-1704`) | true = ON | `onoff_state` | Changes go through `go_to_OFF`/`leave_OFF` which log+push and load the OFF/ON screen (`FW/data/data_actions.c:50-136`). Side effect on ON when `Back_ON_Tsetpoint_Strategy = TSET_STRAT_BACK_ON_COMFORT_T`: `Tsetpoint` reset to `Comfort_Temperature_{HEAT,COOL,AUTO}` and pushed (`:108-127`). |
| Maintenance flag | `Maintenance_Mode` | boolean | r | true while in settings screens / minimal | **no** | Explains a refused `State` write (`EVENT_DATA_MAINTENANCE_LOCKED`). |
| Power-on behaviour | `Back_ON_State_Power` | enum | rw | `POWER_BACK_ON_SWITCH_ON`, `POWER_BACK_ON_KEEP_OFF` (default) | **no** | `FW/features/power_on_restore/power_on_restore.c:86-92`. |

#### A5. HVAC mode

| Need | Firmware variable | Type | Access | Values | Driver? | Notes |
|---|---|---|---|---|---|---|
| Selected mode (index) | `HVAC_Mode` | **int32** | rw | 0..9, default 0 | `mode` (with a `mapping` codec) | **Index into `HVAC_Mode_List[10]`** (`FW/data/data_values.h:820`), i.e. into `HVAC_Mode_0..HVAC_Mode_9`. The displayed mode is `HVAC_Mode_List[HVAC_Mode]` (`main_ui.c:765-786`). |
| Menu slots | `HVAC_Mode_0` … `HVAC_Mode_9` | enum ×10 | rw | `HVAC_MODE_FAN`, `HVAC_MODE_HEAT`, `HVAC_MODE_COOL`, `HVAC_MODE_AUTO`, `HVAC_MODE_ERROR` (`data_values.h:496-504`; `HVAC_MODE_COUNT`=4 is internal). Defaults FAN, HEAT, COOL, AUTO, ERROR×5, FAN (`VARS:296-305`). | **no** | `ERROR` = slot disabled; the list is read up to the first disabled slot. Slot 9 is a reserved system fallback (FAN) never offered in the menu (`FW/feedback_loop/mode_handling.c:545-552`). |
| Resolved mode (what regulation does) | `HVAC_Real_Mode` | enum | r | `HVAC_MODE_FAN/HEAT/COOL/AUTO/ERROR` (AUTO never actually produced) | `hvac_real_mode` | Computed each regulation tick (`FW/feedback_loop/feedback_loop.c:87-94`, pushed on change): HEAT/COOL/FAN pass through; AUTO resolves with hysteresis `Hysteresis_HVAC_Mode_AUTO` (Tset > T + h ⇒ HEAT, Tset < T − h ⇒ COOL, else keep previous; first time: Tset ≥ T ⇒ HEAT) (`FW/feedback_loop/thermo_control.c:88-160`); ERROR if index/list invalid or temperature invalid. Use it for the "Regulated" column and for AUTO. |
| Which modes may be cycled | derived: `Fan_Coil_Type` + change-over | enum | rw | `FAN_COIL_*` 10 values (`VARS:288`) | **no** | Admissible modes: HEAT_ONLY(_2WIRES) ⇒ {FAN, HEAT}; 2T_COOL_ONLY ⇒ {FAN, COOL}; NO_VALVES/2T_MIXED/2T_COOL_ONLY_2WIRES ⇒ {FAN, mode given by change-over}; 4T ⇒ every valid slot (`mode_handling.c:355-395`). Then restricted to slots present in the list (`:418-520`). The local key cycles slots 0..8 (wrap at first ERROR slot), skipping non-admissible ones (`:524-560`, `main_ui.c:445-470`); a dead key is possible if no other admissible mode exists. |
| Change-over source | `ChangeOver_Calculation_Method`, `ChangeOver_HVAC_Mode_External`, `ChangeOver_HVAC_Mode_Value` | enum | rw | `EXTERNAL`, `TEMPERATURE_SENSOR`, `CONTACT_SENSOR` | `change_over_hvac_mode_value` (+timestamp) | `External` is the persisted authority copied into `_Value` (`data_actions.c:800-812`). |
| Power-on mode | `Back_ON_HVAC_Mode_Power` | int32 | rw | index, default 1 | **no** | Rewritten on every runtime mode change (`data_actions.c:170-177`). |

How to resolve the displayed mode: `mode = HVAC_Mode_List[HVAC_Mode]` (read `HVAC_Mode` and the ten
`HVAC_Mode_i`). Then map `HVAC_MODE_HEAT→heat`, `COOL→cool`, `AUTO→auto`, `FAN→fan`. In FAN mode the screen hides
the setpoint digits and shows a large fan glyph (`main_ui.c:266-268, 342-348, 516-523`). Icon colours per mode:
`main_ui.c:273-286, 767-783`.

**Driver gotcha (must fix):** `DRV` maps `HVAC_Mode` with `{'0': fan, '1': heat, '2': cool, '3': auto}`
(`DRV` attribute `mode`). That is only true for the default list; any site with a custom `HVAC_Mode_0..9`
(e.g. HEAT_ONLY fan-coils configured `FAN, HEAT, ERROR…`) is mis-decoded, and writing `2` on such a device is
corrected by the firmware to another slot (§5). The mapping must be built from `HVAC_Mode_0..9` at runtime.

#### A6. Setpoint, step, offered range, unit

| Need | Firmware variable | Type | Access | Values / range | Driver? | Notes |
|---|---|---|---|---|---|---|
| Setpoint (demanded, what the screen shows) | `Tsetpoint` | fxp1000 | rw | **always °C** even in °F display (`main_ui.c:400-407`), default 20 | `temperature_setpoint` | Rounded/clamped by the UI task after every write (§5). Note `VARS:113` says it may differ from the setpoint sent to the machine — that difference is `Tsetpoint_Effective` (B10). |
| Step | `Tsetpoint_Precision` | fxp1000 | rw | whitelist 0.1 / 0.2 / 0.5 / 1 (`config_values_limits.c:5`, `config_validation.c:678-680`), default 1 | **no** | Same step whatever the unit (`VARS:305`). Tenths digit shown only when precision is not integer (`main_ui.c:333-345`). |
| Range type | `Tsetpoint_Range_Type` | enum | rw | `TSETPOINT_VALUE_RANGE`, `TSETPOINT_VALUE_VALUE` (default) | **no** | |
| Bounds (VALUE_VALUE) | `Tmin_HEAT`/`Tmax_HEAT` (16/26), `Tmin_COLD`/`Tmax_COLD` (18/32), `Tmin_AUTO`/`Tmax_AUTO` (18/26) | fxp1000 | rw | °C | **no** | |
| Bounds (VALUE_RANGE) | `Average_Tsetpoint_HEAT/COLD/AUTO` (19/24/22) ± `Interval_Length_HEAT/COLD/AUTO` (3/3/3) | fxp1000 | rw | °C; Average_HEAT limited 16..26, Average_COLD 20..30 (`config_values_limits.h:35-38`) | **no** | |
| Setback narrowing | `Setback_Feature_Activated`, `Setback_Temperature_HEAT` (15, limits 14..18), `Setback_Temperature_COOL` (30, limits 26..32) | boolean / fxp1000 | rw | `config_values_limits.h:194-198` | **no** | See formula below. |
| Unit | `Temperature_Unit` | enum | rw | `TEMPERATURE_UNIT_C`, `TEMPERATURE_UNIT_F`, `TEMPERATURE_UNIT_C_ONLY` (default), `TEMPERATURE_UNIT_F_ONLY` (`data_values.h:531-538`) | `temperature_unit` | `_ONLY` variants forbid the local toggle: tapping the digits cycles C↔F only when value ≤ `_F` (`main_ui.c:548-561`, pushed). Display in °F = `C×9/5+32` (`math_utils.c:12-15`). |
| Power-on unit | `Back_ON_Temperature_Unit` | enum | rw | same enum | **no** | `power_on_restore.c:20`. |

**Offered range formula** (`FW/features/tsetpoint_bounds/tsetpoint_bounds.c:16-87`), with `mode =
HVAC_Mode_List[HVAC_Mode]`:

```
if Tsetpoint_Range_Type == TSETPOINT_VALUE_RANGE:
    min, max = Average_Tsetpoint_<M> - Interval_Length_<M>, Average_Tsetpoint_<M> + Interval_Length_<M>
else:
    min, max = min(Tmin_<M>, Tmax_<M>), max(Tmin_<M>, Tmax_<M>)
# <M> = HEAT | COLD (for HVAC_MODE_COOL) | AUTO
if min == max: HEAT/AUTO: max += 1 °C ; COOL: min -= 1 °C          # lines 39-42, 55-58, 71-74
FAN mode (or unknown): bounds unchanged (previous values kept)     # lines 76-77
# setback narrowing (setback_feature.c:145-181), only if Setback_Feature_Activated,
# and keyed on the REAL mode (get_hvac_real_mode_from_ram), not the selected one:
real HEAT: min = max(min, Setback_Temperature_HEAT); max = max(max, min)
real COOL: max = min(max, Setback_Temperature_COOL); min = min(min, max)
# what the user can actually reach, on every channel (screen, MQTT, Modbus, HTTP — tsetpoint_bounds.h:9-11):
lo = ROUND_INT_OVER_TO(min, Tsetpoint_Precision) ; hi = ROUND_INT_UNDER_TO(max, Tsetpoint_Precision)
Tsetpoint = CLAMP(Tsetpoint, lo, hi)                                 # main_ui.c:250-252, 433-435, 806-807
```

Rounding rules: in °C the stored value is snapped to the grid with `ROUND_INT_CLOSEST_TO` (`main_ui.c:295-311`,
re-published if it changed); in °F the *displayed* value is rounded **up in HEAT, down in COOL, nearest
otherwise** ("toward energy savings", `main_ui.c:97-114, 313-316`), and the ± keys step on the °F grid then
convert back (`:400-430`). The bounds are recomputed when the mode changes (`:796-811`) and when any bound
variable is written (`data_actions.c:505-520`).

#### A7. Fan speed

| Need | Firmware variable | Type | Access | Values | Driver? | Notes |
|---|---|---|---|---|---|---|
| Demanded speed (icon) | `Fanspeed` | enum | rw | `FAN_SPEED_LOW` (default), `FAN_SPEED_MEDIUM`, `FAN_SPEED_HIGH`, `FAN_SPEED_AUTO` (`data_values.h:506-514`; `FAN_SPEED_OFF` exists internally but is rejected for this variable, getter `data_values.c:1105-1120`) | `fan_speed` | The icon always shows the demand (`main_ui.c:692-715`; glyph "" for OFF). |
| Applied speed | `Fanspeed_Applied` | enum | r | `FAN_SPEED_LOW/MEDIUM/HIGH/OFF` — never AUTO (`data_values.c:1086-1104`) | **no** | Written by the regulation after output filtering (`feedback_loop.c:120-124`, `fan_control.c:893`), pushed on change. OFF whenever no output is driven. |
| Regulation type | `Fan_Regulation_Type` | enum | rw | `REGULATION_0_10V` (default), `REGULATION_ON_OFF`, `FAN_REGULATION_3_SPEEDS` (`data_values.h:562-568`) | **no** | |
| Allowed speeds | derived from `Relay_Low/Medium/High_FanSpeed_Active` (3 speeds) or `Percentage_Low/Medium/High_Fan_Speed` ≥ 0 (0-10 V) | boolean / int32 | rw | | **no** | `determine_allowed_fan_speeds` (`FW/feedback_loop/fan_handling.c:76-121`): active ones + AUTO; other regulation types: all four; if none active, LOW forced. A disallowed write is replaced by the closest allowed (`:233-300`, table at `:180-230`). |
| FAN-mode rule | — | | | | | AUTO is meaningless in FAN mode: normalised to MEDIUM (or closest allowed real speed) at every gate — screen, MQTT/HTTP, mode change, boot (`fan_handling.c:398-450`, `main_ui.c:155-161`, `data_actions.c:181-188, 309-315`). |
| Resistance floor | `Resistance_Min_Fan_Percentage`, `Resistance_Lockout` | int32 / boolean | rw / r | 0..100 % ; lockout read-only | **no** | While the electric heater runs, a floor speed applies; a lower local demand shows a 3 s lock icon (`LOCK_DISPLAY_TIME_MS`, `constants.h:6`) then `Fanspeed` is aligned to the floor and pushed (`main_ui.c:637-690`). |
| Power-on speed | `Back_ON_Fanspeed` | enum | rw | same enum, default LOW | **no** | |

Local cycling order: LOW → MEDIUM → HIGH → AUTO → LOW, skipping AUTO in FAN mode and non-allowed speeds
(`main_ui.c:135-195`).

#### A8. Local key locks

| Need | Firmware variable | Type | Access | Driver? | Notes |
|---|---|---|---|---|---|
| ON/OFF key | `State_Block` | boolean | rw | **no** | Checked in `switch_to_off_event` (`main_ui.c:126-133`) and on the OFF screen (`off_ui.c:75-83`): a lock icon is flashed, nothing changes. |
| ± keys | `Tsetpoint_Block` | boolean | rw | **no** | `main_ui.c:387-397`. |
| Mode key | `HVAC_Mode_Block` | boolean | rw | **no** | `main_ui.c:446-451`. |
| Fan key | `FanSpeed_Block` | boolean | rw | **no** | `main_ui.c:137-142`. |

The locks affect **only the touch keys**; MQTT/HTTP/Modbus writes are never blocked by them (their write
action is just a flash save, `data_actions.c:522-531`). All four default to false.

#### A9. Presentation / standby

| Need | Firmware variable | Type | Access | Values | Driver? | Notes |
|---|---|---|---|---|---|---|
| Orientation | `Portrait` | boolean | rw | false = landscape | **no** | **README≠CODE**: `VARS:230` says "non implantée", but the write action requests `CMD_UI_APPLY_PORTRAIT_ROTATION` + full redraw (`data_actions.c:465-478`, handler `FW/lvgl_ui/ui_request.c:114`, layouts `main_ui.c:1088-1115`, top line `top_line.c:141,159`). |
| Font | `Typo` | enum | rw | `MAIN_TYPO` (default), `HAND_TYPO` | **no** | `get_font()` switches on it (`FW/lvgl_ui/fonts/fonts.c:8-13`); write forces a full redraw (`data_actions.c:456-458`). |
| Language | `Language` | enum | rw | `LANGUAGE_ENGLISH`, `LANGUAGE_FRENCH` | **no** | Settings screens only (no reader in `main_ui.c`). |
| Current brightness | `BackLight` | int32 | rw | 0..1000 ‰ (clamped `config_validation.c:1337-1339`) | `back_light` | Runtime output of the backlight state machine (`FW/lvgl_port/lv_port_indev.c`), pushed when a rest level is reached (`:230-240`). Writing it does not wake the screen (commands change the screen, not the light: `main_ui.c:509-514`). |
| Levels | `BackLight_HIGH` (1000, 600..1000), `BackLight_MID` (200), `BackLight_LOW` (50), `BackLight_LOGO` (200) | int32 | rw | ‰ (`config_values_limits.h:211-220`) | **no** | Phases: HIGH while awake → MID after `Time_Delay_Screensaver` → REST after 2× the delay (`lv_port_indev.c:246-268, 273-300`). |
| Rest strategy | `BackLight_Strategy`, `Night_Threshold` | enum / fxp1000 | rw | `BACKLIGHT_STRAT_OFF`, `_LOW`, `_AUTO` (default); threshold on `Brightness` (2.5) | **no** | REST level = 0 (OFF), `BackLight_LOW` (LOW), or LOW/0 depending on `Brightness > Night_Threshold` (AUTO) (`:186-206`). |
| Screensaver delay | `Time_Delay_Screensaver` | int32 | rw | seconds, 0..600 (`config_validation.c:361-363`, `limits.h:20`); 0 = never dim; default 15 | **no** | Screen **content** does not change in standby — only the backlight. |
| Standby logo | `Print_Standby_Logo`, `BackLight_LOGO` | boolean / int32 | rw | default false | **no** | In REST phase, if enabled, not in maintenance and the strategy lights the screen, the ON/OFF screen is replaced by `0:/misc/logo.rle` (`FW/features/standby_logo/standby_logo.c:75-90`). |
| Design variant | `Screen_Design_Type` | enum | rw | `SCREEN_DESIGN_WITH_TSET` (default), `SCREEN_DESIGN_WITHOUT_TSET` | **no** | **No effect in current code**: only readers are the settings screens; the write action is flash save + redraw (`data_actions.c:459-462`). Treat as reserved. |
| Other `Print_*` | `Print_Keycard_Status`, `Print_Window_Status`, `Print_Occupancy`, `Print_Current_Reservation_State`, `Print_Outdoor_Temperature` | boolean | rw | | **no** | **No effect on the main screen**: only temperature and humidity top-line elements exist (`main_ui.c:1045-1076`; the other `ui_ctx` slots are NULL `:1078-1081`). |
| Name | `Thermostat_Name` | char | rw | ≤ 31 chars | **no** | Shown on the public status screen, not on the main face (`VARS:214`). |

### B — "Consignes et mesures" page, measurements, diagnostics

#### B10. Regulated / effective setpoint and why it differs

| Need | Firmware variable | Type | Access | Values | Driver? | Notes |
|---|---|---|---|---|---|---|
| Regulated setpoint | `Tsetpoint_Effective` | fxp1000 | r | °C | **no** | `= Tsetpoint` whenever the shift feature does not apply (FAN, OFF, invalid measure, `thermo_control.c:521`), otherwise `Temperature ± delta_corrected` (`:585-588`); copied to `data_` and pushed on change (`feedback_loop.c:98-105`). **Deviation = `Tsetpoint − Tsetpoint_Effective`.** |
| Shift feature (the only thing that makes them differ) | `Tsetpoint_Shift_HEAT`, `Tsetpoint_Shift_COOL` (0, 0..4), `Tsetpoint_Limit_TrigShift_HEAT` (23), `Tsetpoint_Limit_TrigShift_COOL` (19), `Tsetpoint_Shift_Slope` (0.33, 0..0.9) | fxp1000 | rw | °C / ratio (`VARS:321-327`, `limits.h:55-67`) | **no** | Above (HEAT) / below (COOL) the trigger limit, each extra degree demanded yields only `slope` degrees of effective setpoint, up to the max shift (`thermo_control.c:428-500`). |
| Setback — activation | `Setback_Feature_Activated` | boolean | rw | default false | **no** | |
| Setback — thresholds | `Setback_Temperature_HEAT` (15, 14..18), `Setback_Temperature_COOL` (30, 26..32) | fxp1000 | rw | °C | **no** | |
| Setback — grace delay | `Time_Delay_Setback_Retrigger` | int32 | rw | s, 300, 60..600 (`limits.h:244-245`) | **no** | After any client write of `State` or `Tsetpoint` (any channel), setback stays quiet for this delay (`setback_feature.c:64-88`, `data_actions.c:235-253`). |
| Setback — current status | **none** | | | | | `setback_is_active()` is a C function (`setback_feature.c:140-143`), not a variable. Status must be inferred: `Setback_Feature_Activated && real mode HEAT && Temperature < Setback_Temperature_HEAT` (COOL symmetric). |
| Setback — "since when" / activation timestamp | **none** | | | | | Not stored anywhere. |
| Occupancy source of an eco setpoint | see B11 | | | | | |

**What setback actually is (README≠task wording).** In code, setback is a **temperature floor/ceiling
protection**, not an "unoccupied eco setpoint": every 5 min (`FW/features/optimization/optimization.c:22,
349-361`) if the room is colder than `Setback_Temperature_HEAT` (real mode HEAT) it forces `State = true` and
raises `Tsetpoint` to that floor (COOL: symmetric ceiling) (`setback_feature.c:90-133`). It never lowers a
setpoint. Occupancy plays no role. The occupancy/window "eco" behaviour is a *different* feature:
`Saving_Strategy_Occupancy` / `Saving_Strategy_Window` with `Standby_Temperature_HEAT/COOL` (17/28),
`Tsetpoint_Shift_HEAT/COOL_Occupancy` (3/3), `Comfort_Temperature_HEAT/COOL/AUTO` (`VARS:453-463`), applied only
between 08:00 and 21:00 local (`optimization.c:25-26, 44-54`), once per occupancy transition
(`optimization.c:170-250`) — strategies: `STATE_STRATEGY_1` (ON when occupied / OFF when empty),
`STATE_STRATEGY_2` (OFF when empty), `TSETPOINT_STRATEGY_1` (standby temperature when empty),
`TSETPOINT_STRATEGY_2` (±shift bounded by standby temperature). Priority: setback, then window, then occupancy
(`:338-361`).

**Important code fact (verify on hardware, §6):** neither `setback_feature_run` nor the strategies call
`save_data_log`, `ui_request`, `go_to_OFF`/`leave_OFF` or `execute_value_actions` (grep over
`setback_feature.c` and `optimization.c` returns nothing; contrast with the invariant stated at
`data_actions.c:274-279`). Their writes to `State`/`Tsetpoint` are therefore **not pushed on MQTT and do not
reload the screen** by themselves; MQTT only sees them at the next READ_DATA or when another path re-publishes
(`update_ui_digit_images` re-logs `Tsetpoint` when it notices a change, `main_ui.c:254-257`).

#### B11. Occupancy

| Need | Firmware variable | Type | Access | Values | Driver? | Notes |
|---|---|---|---|---|---|---|
| Radar, raw | `Radar_Raw` | boolean | r | true = presence | `radar_raw` | Read from the radar's digital output every 1 s (`APP:850`, `FW/adc/adc.c:311-321`), pushed on change (`APP:876-880`). **README≠CODE**: `VARS:133` shows access "—"; code is read-only. |
| Radar enable | `Radar_Enable` | boolean | rw | default true | **no** | Drives `RADAR_EN` (`FW/outputs/actuators.c:564-590`, `data_actions.c:346-348`) — implemented despite `VARS:498` "non implantée". |
| Filtered occupancy | `Occupancy` | enum (tristate) | rw* (no ACL in `data_values.c:615`) | `TRISTATE_FALSE`, `TRISTATE_TRUE`, `TRISTATE_NA` (default) | **no** | Recomputed every 60 s (`FW/features/occupancy/occupancy.c:250-286`), pushed on change together with its timestamp. **Not fed by `Radar_Raw`**: `motion_detected()` looks at rising edges of `Occupancy` itself (`:54-80`) and nothing else writes `Occupancy` (grep over the whole application) — the radar and the filtered occupancy are disconnected in this tree. A keycard "not inserted" (if that value were ever fed) forces FALSE (`:218-224`). |
| Occupancy timestamp | `Occupancy_Timestamp` | int32 | rw* | Unix s | **no** | Set on each transition of `Occupancy` (`occupancy.c:272-278`). |
| Keycard | `Keycard_Ext_Sensor_Value`, `Keycard_Ext_Sensor_Timestamp` | enum / int32 | rw* (`data_values.c:601-602`, **README≠CODE** `VARS:161` says r) | tristate; default NA / 0 | `keycard_ext_sensor_value`, `keycard_ext_sensor_timestamp` | **Never written by the firmware**: `FW/ext_sensors/ext_sensors.c` only handles change-over temperature and contact (`:112-168, 243-263`); `EXT_CARD_SENSOR` appears only in the settings UI (`FW/lvgl_ui/settings/io_control.c:195`). Can be fed by the server over MQTT (timestamp not auto-set). |
| External presence sensor | `Occupancy_Ext_Sensor_Value`, `Occupancy_Ext_Sensor_Timestamp` | enum / int32 | rw* | tristate | `occupancy_ext_sensor_value`, `…_timestamp` | Same: declared, never written by firmware, not read by `occupancy.c`. |
| "Last movement" timestamp | **none** | | | | | Only `Radar_Raw` transitions (each pushed with `ts`) — Gridone must timestamp them itself. |
| PMS / reservation (server-fed) | `Current_Reservation_State`, `Current_Reservation_Timestamp`, `Future_Reservation_State`, `…_Timestamp` | enum / int32 | w | tristate | **no** | Only used to halve the occupancy suspension timers (`occupancy.c:155-162`). Timestamps auto-set on write (`data_actions.c:369-380`). |
| Freshness rule | constants | | | `DATA_MAX_AGE_SECONDS` = 25 h (`FW/utils/features_utils.h:8`); occupancy/window data must be < 600 s old to trigger a strategy (`optimization.c:29-30`) | | |

#### B12. Window

| Need | Firmware variable | Type | Access | Values | Driver? | Notes |
|---|---|---|---|---|---|---|
| Computed window status | `Window_Status`, `Window_Status_Timestamp` | enum / int32 | rw* (`data_values.c:613-614`; **README≠CODE** `VARS:191` says r) | tristate, default NA | `window_status`, `window_status_timestamp` | Software detection every 10 s (`FW/features/open_window/open_window.c:20, 69-124`): open if temperature drops (HEAT) / rises (COOL) by more than `Delta_Temperature_Open_Window` (3 °C) within `Delta_Time_Open_Window` (900 s) and at least `Threshold_Time_Open_Window` (120 s) apart; requires `Open_Window_Software_Feature` (default false). Pushed on transition (`:115-116, 178-179`). Reset when stale > 600 s (`optimization.c:131-142`) or after the window strategy fired (`:172-176`). |
| External window contact | `Window_Ext_Sensor_Value`, `Window_Ext_Sensor_Timestamp` | enum / int32 | rw* | tristate | `window_ext_sensor_value`, `…_timestamp` | **Never written by firmware and not used by the detector** (no reference in `open_window.c`), despite `VARS:191`. |
| Effect | `Saving_Strategy_Window` | enum | rw | `NO_SAVING_STRATEGY` (default), `STATE_STRATEGY_1/2` (OFF), `TSETPOINT_STRATEGY_1/2` | **no** | `optimization.c:57-108`, 08:00–21:00 only. Same silent-write caveat as B10. |
| Detector tuning | `Open_Window_Software_Feature`, `Delta_Temperature_Open_Window`, `Delta_Time_Open_Window`, `Threshold_Time_Open_Window` | boolean / fxp1000 / int32 | rw | | **no** | |

#### B13. Fan-coil organs (readable outputs)

| Need | Firmware variable | Type | Access | Values | Driver? | Notes |
|---|---|---|---|---|---|---|
| Heating (or mixed 2-pipe) valve | `Relay_Heat_Valve` / `DAC_Heat_Valve` | boolean / int32 | r (`ACL_NEVER`, `data_values.c:626-632`) | on-off / 0..100 % | **no** | Which one is meaningful depends on `Heat_Valve_Regulation_Type` (`REGULATION_0_10V` ⇒ DAC, `REGULATION_ON_OFF` ⇒ relay; `FW/outputs/set_outputs.c:215-230`). Pushed on each actuator change (`FW/outputs/actuators.c:63, 104, 136, 253`). |
| Cooling valve (4-pipe) | `Relay_Cool_Valve` / `DAC_Cool_Valve` | boolean / int32 | r | | **no** | Only used for `FAN_COIL_4T*` (`VARS:206-209`). |
| Fan actually driven | `Fanspeed_Applied` (+ `Relay_Low/Medium/High_FanSpeed`, `DAC_FanSpeed` %) | enum / boolean / int32 | r | | **no** | See A7. |
| Electric heater | `Relay_Resistance` / `DAC_Resistance`, `Resistance_Lockout` | boolean / int32 / boolean | r | | **no** | Config: `Resistance_Usage_Type` (`RESISTANCE_USAGE_PARALLEL`/`SERIAL`), `Relay_Resistance_Active`, `DAC_Resistance_Active`. |
| Change-over | `ChangeOver_Temp_Value` + `_Timestamp`, `ChangeOver_Contact_Value` + `_Timestamp`, `ChangeOver_HVAC_Mode_Value` + `_Timestamp` | fxp1000 / tristate / enum | r / r / rw | | `change_over_*` (all six) | Fed by `ext_sensors.c` when `ChangeOver_Temperature_Sensor` / `ChangeOver_Contact_Sensor` point to `DI_1`/`DI_2` and `External_Sensor_1/2` are `EXT_PT1000_SENSOR`/`EXT_NTC5k_SENSOR`/`EXT_CONTACT_SENSOR`; pushed on change. Thresholds `Temp_Limit_ChangeOver_HEAT/COOL`, `Mode_Change_Delay`. |
| Digital inputs | `DI_1`, `DI_2` (+ `DI_1_Logic/DI_2_Logic`, `DI_1_Calibration/DI_2_Calibration`, `External_Sensor_1/2`) | float | r | −1 when unused | `di_1`, `di_2` | Sampled every 1 s (`APP:848-849`) but **not pushed on change** (no `new_data_update_process` for them) ⇒ poll. |
| Fan-coil topology | `Fan_Coil_Type`, `Fan_Regulation_Type`, `Heat_Valve_Regulation_Type`, `Cool_Valve_Regulation_Type`, `Resistance_Regulation_Type`, `Fan_Valve_Dependency`, `Permanent_Fan` | enum / boolean | rw | | **no** | Needed to know which organs exist. |

#### B14. Diagnostics

| Need | Firmware variable | Type | Access | Values | Driver? | Notes |
|---|---|---|---|---|---|---|
| Versions | `App_Version`, `Bootloader_Version`, `Stage0_Version`, `Required_Bootloader_Version`, `Required_Stage0_Version` | version | r | `"A.B.C"` (−1 parts when unset) | `app_version`, `bootloader_version`, `stage0_version`, `required_*` | Pushed once at boot (`mqtt_release_data_timer_start`, `mqtt_application.c:329-337`). |
| Firmware id | `FirmwareVersion`, `GitHash` | int32 / char | r | `0xAABBCCDD` (`VARS:81`) / short hash | `firmware_version`, `git_hash` | |
| Build/mode | `Boot_Mode`, `Maintenance_Mode` | enum / boolean | r | `BOOT_MODE_NORMAL`, `BOOT_MODE_FAKE_MINIMAL`, `BOOT_MODE_MINIMAL` | `boot_mode` / **no** | |
| Last event | `Event` | enum | r (`ACL_NEVER`; **README≠CODE** `VARS:108` "—") | 106 names (`data_values.h:351-488`), e.g. `EVENT_DATA_BAD_VALUE`, `EVENT_DATA_UNKNOWN_NAME`, `EVENT_DATA_READ_ONLY`, `EVENT_DATA_MAINTENANCE_LOCKED`, `EVENT_MQTT_CMD_ERROR`, `EVENT_BOOT_WDT`, `EVENT_REBOOT_*` | `event` | Every event is logged ⇒ pushed; the value only holds the last one. It is the **only feedback channel for a refused write** (§5). |
| Watchdog reboot | `Reboot_Timestamp`, `Reboot_Count_UTC` | int32 | r (`ACL_NEVER`; **README≠CODE** `VARS:105-106` say rw) | Unix s / count | `reboot_timestamp` (declared **writable in DRV — invalid**) / **no** | Set only after a watchdog reset (`APP:760-766`), pushed. Wire name of the count is `Reboot_Count_UTC` (`data_values.c:49`). |
| Wi-Fi | `RSSI` | int32 | r | dBm; `INT32_MIN` when not joined | `rssi` | Refreshed ≈ every second, pushed when it moves by > 2 dB (`APP:993-1011`). |
| Clock | `Timestamp_UTC`, `Time_Zone_Difference_Minutes`, `Time_Server` | int32 / int32 / char | rw | Unix s / min / host | `timestamp_utc` / **no** / **no** | |
| CPU temperature | `Temperature_CPU` | fxp1000 | r | °C, noisy | `temperature_cpu` | Not pushed on change ⇒ poll. |
| Raw sensors | `Temperature_Raw_1`, `Temperature_Raw_2`, `Humidity_Raw`, `Brightness_Raw`, `Brightness` | fxp1000 | r | | `temperature_raw_1/2`, `humidity_raw`, `brightness_raw`, `brightness` | Pushed when change > `Temperature_Precision` / `Humidity_Precision` / `Brightness_Precision` (`APP:867-873`). |
| Sensor config | `SHT_Sensor`, `Use_Temperature_Raw_1/2`, `Temperature_Coeff_*`, `Humidity_Calibration`, `Brightness_Calibration` | enum / boolean / float / fxp1000 | rw | | **no** | Explains a `Temperature` that differs from the raws. |

#### B15. Last command origin (local vs remote)

**Nothing exists.** Evidence:

- On-change messages carry `name/type/acl/value/magic` only (`mqtt_application.c:1944-1956`); `acl` is the
  variable's static permission string, not the writer.
- The only "who wrote" memory is `s_last_client_setpoint_write` (`data_actions.c:225-253`): a private
  timestamp of the last `State`/`Tsetpoint` write, deliberately identical for screen, MQTT, HTTP, Modbus and
  scripts, and not exposed.
- The only origin-bearing signals are reboot events (`EVENT_REBOOT_MQTT/HTTP/MODBUS/SCRIPT/UI/MQTT_WDT`,
  `data_values.h:464-473`) and the privilege suffix of the reply topic (`/user`, `/admin`, `/sadmin`), which
  reflects the *caller's ACL level*, not local vs remote.

A local-vs-remote attribution can only be a Gridone-side heuristic: a pushed change of `State`, `Tsetpoint`,
`HVAC_Mode`, `Fanspeed` or `Temperature_Unit` that is not the echo of a Gridone command within the last few
seconds was made elsewhere (touch screen, another MQTT client, HTTP, Modbus, or a firmware feature — setback,
strategies, power-on restore, bounds clamp).

---

## 3. Gaps

### 3.1 Needs with NO firmware variable (must be shown as unavailable, never invented)

| Need | Status |
|---|---|
| Setback currently active / since when / which occupancy source | No variable (§B10). Status can be *derived* from `Setback_Feature_Activated`, `HVAC_Real_Mode`, `Temperature`, `Setback_Temperature_*`; the timestamp cannot. |
| "Eco setpoint because unoccupied" as a distinct state | No variable; the occupancy strategy rewrites `Tsetpoint`/`State` in place (§B10) — the original comfort setpoint is lost unless Gridone remembers it. |
| Last movement timestamp | Only `Radar_Raw` transitions; no stored timestamp. |
| Keycard / external presence / external window values | Declared, **never fed by the firmware** (§B11, §B12); readable only if a server writes them. Show as "not connected" unless a writer exists. |
| Filtered `Occupancy` from the radar | Disconnected in code (§B11); do not present `Occupancy` as "radar-based presence". |
| Last command origin | Nothing (§B15). |
| `Screen_Design_Type`, `Print_Keycard_Status`, `Print_Window_Status`, `Print_Occupancy`, `Print_Current_Reservation_State`, `Print_Outdoor_Temperature` on the face | Variables exist but have no effect on the main screen in this tree (§A9); the replica must not render them. |
| Physical top-line elements other than temperature/humidity | None exist. |

### 3.2 Variables that exist but are missing from the Gridone driver (`DRV`)

Runtime (read): `Occupancy`, `Occupancy_Timestamp`, `Tsetpoint_Effective`, `Fanspeed_Applied`,
`Resistance_Lockout`, `Maintenance_Mode`, `Reboot_Count_UTC`, `Relay_Low/Medium/High_FanSpeed`,
`Relay_Heat_Valve`, `Relay_Cool_Valve`, `Relay_Resistance`, `DAC_FanSpeed`, `DAC_Heat_Valve`, `DAC_Cool_Valve`,
`DAC_Resistance`.

Configuration needed by the face replica (read, some write): `HVAC_Mode_0..HVAC_Mode_9`, `Tsetpoint_Precision`,
`Temperature_Precision`, `Humidity_Precision`, `Print_Indoor_Temperature`, `Print_Humidity`, `Print_Green_Leaf`,
`State_Block`, `Tsetpoint_Block`, `HVAC_Mode_Block`, `FanSpeed_Block`, `Tsetpoint_Range_Type`,
`Tmin_HEAT/Tmax_HEAT/Tmin_COLD/Tmax_COLD/Tmin_AUTO/Tmax_AUTO`, `Average_Tsetpoint_*`, `Interval_Length_*`,
`Fan_Regulation_Type`, `Fan_Coil_Type`, `Relay_Low/Medium/High_FanSpeed_Active`, `Percentage_Low/Medium/High_Fan_Speed`,
`Resistance_Min_Fan_Percentage`, `Portrait`, `Typo`, `Time_Delay_Screensaver`, `BackLight_HIGH/MID/LOW/LOGO`,
`BackLight_Strategy`, `Night_Threshold`, `Print_Standby_Logo`, `Thermostat_Name`, `Time_Zone_Difference_Minutes`.

Configuration needed by the page: `Setback_Feature_Activated`, `Setback_Temperature_HEAT/COOL`,
`Time_Delay_Setback_Retrigger`, `Tsetpoint_Shift_HEAT/COOL`, `Tsetpoint_Limit_TrigShift_HEAT/COOL`,
`Tsetpoint_Shift_Slope`, `Saving_Strategy_Occupancy`, `Saving_Strategy_Window`, `Standby_Temperature_HEAT/COOL`,
`Comfort_Temperature_HEAT/COOL/AUTO`, `Tsetpoint_Shift_HEAT/COOL_Occupancy`, `Open_Window_Software_Feature`,
`Delta_Temperature_Open_Window`, `Delta_Time_Open_Window`, `Threshold_Time_Open_Window`,
`Back_ON_Tsetpoint_Strategy`, `Back_ON_State_Power`, `Back_ON_HVAC_Mode_Power`, `Back_ON_Fanspeed`,
`Back_ON_Temperature_Unit`, `Radar_Enable`, `Hysteresis_HVAC_Mode_AUTO`, `Heat_Valve_Regulation_Type`,
`Cool_Valve_Regulation_Type`, `Resistance_Regulation_Type`, `Resistance_Usage_Type`, `ChangeOver_Calculation_Method`,
`ChangeOver_HVAC_Mode_External`, `External_Sensor_1/2`, `SHT_Sensor`.

Server-fed inputs the page may want to show: `Outdoor_Temperature` (+`_Timestamp`), `Current_Reservation_State`,
`Future_Reservation_State` (+timestamps) — write-only (`w`), so Gridone can only display what it wrote.

### 3.3 Driver defects found while cross-checking

1. `mode` mapping `0→fan,1→heat,2→cool,3→auto` is wrong in general (§A5) — decode through `HVAC_Mode_0..9`.
2. `reboot_timestamp` declares a `write`; the firmware refuses (`ACL_NEVER`) with `EVENT_DATA_READ_ONLY` and
   republishes the real value (`mqtt_application.c:836-851`).
3. `update_strategy.polling_enabled: false` + `expected_push_interval: 300`: measurements are pushed only when
   they move by more than their precision, config values are pushed only when written, and `DI_1/DI_2`,
   `Temperature_CPU`, `Brightness` (treated: pushed) / raws are threshold-pushed. A quiet room can stay silent
   for much longer than 300 s ⇒ either poll `RT` periodically or lengthen the healthcheck; configuration must be
   fetched once (`READ_DATA CONF`) at discovery since it is never pushed spontaneously.
4. The driver only listens on `updData/${mac}`; that is correct as long as Gridone publishes commands on the base
   topic `<MAC>` (replies follow the caller's level, `mqtt_application.c:397-401, 1524-1541`).
5. Numeric writes must be JSON numbers: a quoted `"21.5"` for `Tsetpoint` is rejected (`mqtt_write_data_other`
   default branch, `:748-770`) — check how Gridone renders `${value}` for `float`/`int` attributes (§6).

---

## 4. Write semantics (what the UI will command)

Common rules (`FW/lwesp/mqtt_application.c:821-877`): a WRITE_DATA needs both `data` and `value`; permission is
checked first (`data_write_permission`, `FW/data/data_values.c:1690-1704`): insufficient level ⇒
`EVENT_DATA_READ_ONLY`; `State` during maintenance ⇒ `EVENT_DATA_MAINTENANCE_LOCKED`; in both cases the
**current** value is republished so the BMS sees the refusal (`:845-851`). Unknown name ⇒ `EVENT_DATA_UNKNOWN_NAME`;
wrong value type/name ⇒ `EVENT_DATA_BAD_VALUE`. There is **no positive acknowledgement**: `EVENT_MQTT_CMD_OK`
exists in the enum but is never emitted (only referenced in `data_values_minimal.c:348`). Success is observed
through the echo: every accepted write runs `data_apply_actions` → `execute_value_actions` → generic
`save_data_log(variable)` (`FW/data/data_actions.c:853`) → push on `updData/<MAC>` (`{"name":…,"value":…}`,
`ts` = write time). Corrections made by the firmware are pushed as *additional* messages (below), so the UI
must treat the **last** received value as truth, not the value it sent. Values written but unchanged
(`has_changed=false`) are still echoed (the generic log is unconditional) but side actions are skipped
(`data_actions.c:242-270`).

| Variable | Accepted JSON `value` | Clamping / rounding by firmware | Side effects | Echo |
|---|---|---|---|---|
| `State` | `true`/`false` (native), or a string `"true"/"1"/"on"/"yes"` etc. (lenient parser `FW/data/data_management.h:43-56`) | none | `leave_OFF`/`go_to_OFF`: screen switches ON/OFF; on ON with `Back_ON_Tsetpoint_Strategy = TSET_STRAT_BACK_ON_COMFORT_T`, `Tsetpoint` := comfort temperature of the current mode (`data_actions.c:108-127`); arms the setback grace delay (`:250-253`); refused while `Maintenance_Mode` | `State` pushed (`:60-62, 92-100`); `Tsetpoint` pushed if the strategy rewrote it. |
| `HVAC_Mode` | JSON integer index 0..9 (a JSON real is truncated `(int)`, `mqtt_application.c:672-678`); an enum name string is **rejected** | index ≥ 10 ⇒ 0; slot holding `ERROR` ⇒ 0 (`apply_hvac_mode_change`, `data_actions.c:137-165`); slot not admissible for the fan-coil / change-over ⇒ replaced by the first slot holding the same mode, else first non-FAN admissible slot, else FAN (`validate_requested_hvac_mode`, `mode_handling.c:418-520`, applied at `data_actions.c:291-309`) | persists `Back_ON_HVAC_Mode_Power`; `Fanspeed` AUTO→MEDIUM if the new mode is FAN (`:181-188`); UI recomputes bounds and **re-clamps `Tsetpoint`** for the new mode (`main_ui.c:796-811`) | `HVAC_Mode` (generic) — the *corrected* index if corrected; plus `Fanspeed` if normalised; plus `Tsetpoint` from the UI clamp (`main_ui.c:806-811`, always logged on mode change). |
| `Tsetpoint` | JSON number in °C (`21.5`; an integer `21` is accepted) — **not** a quoted string; °F is never accepted | no clamp at the write layer (`config_validation.c:1315-1316` is a no-op); the UI task then clamps to `[ROUND_INT_OVER_TO(min,p), ROUND_INT_UNDER_TO(max,p)]` and snaps to the precision grid (`main_ui.c:244-257, 295-311`) — only in the NORMAL build with the UI up | arms the setback grace delay; occupancy "dissatisfaction" accounting (`occupancy.c:85-126`) | `Tsetpoint` (generic, raw value as written) then a **second `Tsetpoint` push with the clamped/rounded value** if it differed (`main_ui.c:254-257, 306-309`). |
| `Fanspeed` | enum name string: `"FAN_SPEED_LOW"`, `"FAN_SPEED_MEDIUM"`, `"FAN_SPEED_HIGH"`, `"FAN_SPEED_AUTO"` (`"FAN_SPEED_OFF"` and integers rejected) | for 3-speed / 0-10 V regulation, a speed that is not allowed is replaced by the closest allowed (`data_actions.c:297-306`, table `fan_handling.c:180-230`); AUTO in FAN mode ⇒ MEDIUM/closest (`:309-315`) | resistance floor may later re-align it (A7) | `Fanspeed` (generic), plus another `Fanspeed` push carrying the corrected value when corrected. |
| `State_Block`, `Tsetpoint_Block`, `HVAC_Mode_Block`, `FanSpeed_Block` | boolean (native or lenient string) | none | flash save only (`data_actions.c:522-531`); effective at the next key press; no screen change | pushed (generic). |
| `Temperature_Unit` | enum name string (`"TEMPERATURE_UNIT_C"`, `"_F"`, `"_C_ONLY"`, `"_F_ONLY"`) | invalid ⇒ default (`config_validation.c:1332-1334`) | top line and digits redrawn; **`Tsetpoint` stays in °C on MQTT**; in °F display the shown setpoint is rounded by mode (A6), and the °C value may be re-snapped and re-pushed (`main_ui.c:295-309`) | `Temperature_Unit` pushed; possibly `Tsetpoint`. |
| `BackLight` (if the UI offers it) | integer 0..1000 | clamped (`config_validation.c:1337-1339`) | none on the state machine (no action case; falls in `default:` flash save, `data_actions.c:846-848`); overwritten at the next backlight phase change | pushed. |
| `Print_Green_Leaf`, `Print_Indoor_Temperature`, `Print_Humidity`, `Portrait`, `Typo`, `Time_Delay_Screensaver`, `Tsetpoint_Precision`, bounds | as per type | `Time_Delay_Screensaver` 0..600; precisions whitelisted (invalid ⇒ default); bounds re-clamp `Tsetpoint` | screen redraw; bounds ⇒ `Tsetpoint` clamp pushed | pushed. |

MINIMAL / fake-minimal builds: writes are stored and echoed but no action runs (no clamp, no screen change,
`FW/data/data_management.h:31-35`), and most of the above variables do not exist in MINIMAL.

---

## 5. Firmware-initiated changes the UI must expect (not commands)

| Variable | Changed by | Pushed? |
|---|---|---|
| `State`, `Tsetpoint` | setback floor/ceiling (`setback_feature.c:104-127`), window/occupancy strategies (`optimization.c:57-108, 170-250`) | **No** (silent, §B10) |
| `State`, `Tsetpoint`, `HVAC_Mode`, `Fanspeed`, `Temperature_Unit`, `ChangeOver_HVAC_Mode_Value` | power-on restore (`power_on_restore.c:20-123`) | Yes |
| `HVAC_Mode` | regulation loop correcting a mode that became inadmissible (`feedback_loop.c:64-85`); `HVAC_Mode_i` write invalidating the current slot (`data_actions.c:482-500`) | Yes |
| `Fanspeed` | resistance floor alignment (`main_ui.c:662-670`); relay/percentage config making it disallowed (`data_actions.c:610-618, 690-698`) | Yes |
| `Tsetpoint` | UI clamp/rounding on bounds, mode, unit or precision change (`main_ui.c:244-257, 295-311, 796-811`) | Yes |
| `Temperature_Unit` | local tap on the digits (`main_ui.c:548-561`) | Yes |
| `BackLight` | backlight state machine (`lv_port_indev.c:230-240`) | Yes (rest level reached) |
| `HVAC_Real_Mode`, `Tsetpoint_Effective`, `Fanspeed_Applied`, `Resistance_Lockout`, relays/DACs | regulation loop every `Feedbackloop_Time_Interval` (2 s) | Yes (on change) |
| `Occupancy`(+ts), `Window_Status`(+ts), `Radar_Raw`, `RSSI`, `Event`, `Reboot_*`, change-over values | features / sensor tasks | Yes (on change / threshold) |
| `Temperature`, `Humidity`, `Brightness`, raws | sensor task | Yes, only when |Δ| > precision |
| `DI_1`, `DI_2`, `Temperature_CPU`, `Timestamp_UTC`, all configuration | — | **No** spontaneous push (poll) |

---

## 6. Verify on hardware (10 checks, most important first)

**Pending: 0/10 performed.** Access to the broker-connected office thermostat has
not been provided. The runbook `gridone-setup/docs/pilot-validation.md` and collector
`src/seed/inventory.py` are delivered in the setup commit above (121 tests passed).
The collector defaults to cached GET snapshots; `--refresh` requests active attribute
reads only and makes no write command. Neither mode qualifies the write/echo checks
below. Capture initial settings, raw MQTT payloads and timestamps for each check,
and restore modified settings as described in the runbook. Synthetic WebSocket
rendering measurements are separate from this gate.

1. **Numeric write encoding.** Send `{"command":"WRITE_DATA","data":"Tsetpoint","value":21.5}` and
   `…"value":"21.5"` from Gridone's actual `${value}` rendering; expect the first to be echoed and the second
   to produce `Event = EVENT_DATA_BAD_VALUE` with no change. Same for `HVAC_Mode` (`2` vs `"2"`).
2. **Echo contract.** After each write, capture `updData/<MAC>`: confirm one message per variable
   (`name/type/acl/value/magic`, `ts`), the second corrected `Tsetpoint` message when the value is off-grid or
   out of bounds (e.g. write `19.37` with precision 0.5), the corrected `Fanspeed`/`HVAC_Mode` messages, and
   the measured latency (expected < 1 s; the flash-log sender loop is 10 ms with a 1 s idle back-off).
3. **Silent internal writes.** With `Setback_Feature_Activated=true`, `Setback_Temperature_HEAT=18`, real mode
   HEAT and the room below 18 °C, turn the device OFF from the screen and wait > `Time_Delay_Setback_Retrigger`
   (+ up to 5 min): does `updData/<MAC>` receive `State=true` / `Tsetpoint=18`, and does the screen leave the
   OFF page? The code says neither happens (§B10) — this decides whether the page can trust pushes alone.
4. **Occupancy vs radar.** Wave in front of the device: `Radar_Raw` should toggle and be pushed; check whether
   `Occupancy`/`Occupancy_Timestamp` ever follow (code says they do not) and what `Occupancy` does in the first
   20 min after boot.
5. **External sensor tristates.** With `External_Sensor_1 = EXT_CARD_SENSOR` (or PIR/window) wired, confirm
   `Keycard_Ext_Sensor_Value` / `Occupancy_Ext_Sensor_Value` / `Window_Ext_Sensor_Value` stay `TRISTATE_NA`
   (never fed), and that a WRITE_DATA on them is accepted (no ACL) — decide whether Gridone should ever write them.
6. **Timestamp epoch.** Read `Timestamp_UTC`, `Occupancy_Timestamp`, `Window_Status_Timestamp` and compare with
   wall-clock: expect Unix seconds (not 2020/2025-based as the readme says); check the value before the first
   NTP sync (build-epoch floor).
7. **`HVAC_Mode` semantics with a non-default list.** Set `HVAC_Mode_0..9 = FAN, HEAT, ERROR, …` on a
   `FAN_COIL_2T_HEAT_ONLY` device, write `HVAC_Mode = 2` and `= 3`: confirm the corrected index echoed and that
   the current driver decodes them wrongly; confirm which slot the local key cycles to.
8. **Setpoint bounds.** With `Tsetpoint_Range_Type = TSETPOINT_VALUE_RANGE`, `Average_Tsetpoint_HEAT = 19`,
   `Interval_Length_HEAT = 3`, precision 0.5: write `Tsetpoint = 15` and `= 25` and read back 16.0 / 22.0;
   then enable setback (`Setback_Temperature_HEAT = 17`) and confirm 15 → 17.0. Repeat in AUTO to confirm the
   narrowing follows `HVAC_Real_Mode`.
9. **°F behaviour.** Set `Temperature_Unit = TEMPERATURE_UNIT_F`, press + on the screen: confirm `Tsetpoint`
   on MQTT remains °C, the °F shown is rounded up in HEAT / down in COOL, and whether a `_ONLY` unit really
   disables the tap toggle.
10. **Face defaults and dead flags.** On a factory device confirm the top line is empty
    (`Print_Indoor_Temperature`/`Print_Humidity` default false), that `Print_Green_Leaf` alone controls the
    leaf, that `Screen_Design_Type = SCREEN_DESIGN_WITHOUT_TSET` and `Print_Occupancy`/`Print_Window_Status`
    change nothing, that `Portrait = true` rotates the screen (readme says unimplemented), and that a
    `Reboot_Timestamp` write is refused with `EVENT_DATA_READ_ONLY` + republish.
