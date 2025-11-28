# Bacnet Transport Client

Bacnet is an object oriented transport protocols.

## Specificities of the current implementation

To interact with devices on a bacnet network, we need to create a *bacnet application* which acts itself as a device.

Only a single application can be used per ip/port.

Currently the application is created on client init. So make sure to close a client before creating a new one with same ip/port otherwise the second one will fail to discover devices.

Future optimizations can include creating a *bacnet stack* shared by multiple clients, responsible for discovering and registering device addresses.

## Priorities

Bacnet write property requests have a priority level 1-16 (lower values have higher priority). Writing properties will have no effect if overridden by a higher property rule.

Bacnet priorities range as follows:

| Priority Range | Description |
|----------------|-----------------------------------------------------------------------------|
| 1–2            | Life safety (fire, smoke, emergency shutdown) → don’t touch.               |
| 3–4            | Critical / manual overrides at the plant or local controller.               |
| 5–6            | Protective limits (freeze protection, high limit, etc.).                    |
| 7–8            | Operator overrides / automatic control from a BMS.                           |
| 9–15           | Lower-importance automation, optimization, “nice to have”.                  |
| 16             | Lowest priority (often used for “normal” default commands).                |

Bacnet write priorities allowed in bacnet addresses for this client are 5 to 16 (no life safety or critical priority overridding).
