# Gridone Core

Core package includes all the necessary utilities to manage devices.
- devices
- drivers
- transports

## Structure

## Package layout

Package follows a standard `src` layout and unit tests are located in the `tests` directory.

## Class diagram

```mermaid
classDiagram

class Device {
    +id: str
    +config: dict
    +driver: Driver
    +attributes: dict[str, Attribute]
}

class Driver {
    +env: dict
    +transport: TransportClient
    +schema: DeviceSchema
}

class Attribute
class TransportClient
class DeviceSchema

Device *-- Driver
Device *-- Attribute : attributes (many)
Driver *-- TransportClient
Driver *-- DeviceSchema
```
