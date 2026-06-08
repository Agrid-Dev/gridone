# Devices

A **device** is the fundamental object that Gridone controls. It represents any physical piece of building equipment — a thermostat, chiller, boiler, energy meter, sensor, or any other controllable or measurable unit.

Each device requires three things to work:

- **A driver** — a YAML file that describes the device model: its attributes, how to read and write them in the protocol it speaks. Multiple devices can use the same driver (typically all devices of a given vendor/model)
- **A transport** — a configured connection to the network (an MQTT broker, a Modbus gateway, an HTTP server, a KNX/IP gateway...)
- **Device config** — device-specific parameters such as an IP address or device ID. The device config information required is specified by the driver. It is what's needed to uniquely identify the device.

In other words: the driver says how to speak to a device, a transport is where to speak to it, and the config is how to address it specifically.

The next sections document how to write a driver.
