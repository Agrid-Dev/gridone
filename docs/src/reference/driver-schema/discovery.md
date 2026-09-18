# Discovery

The `discovery` block lets a driver on a push transport register [devices](../glossary.md#device) automatically: Gridone listens on a topic and creates a device the first time an unknown announcement is seen. See [Discovery](../glossary.md#discovery).

```yaml
discovery:
  topic: updData/+
  field_getters:
    - name: mac
      codecs:
        - json_path: $.mac
  name_attribute: thermostat_name
```

## Fields

| Field | Required | Description |
|---|---|---|
| `topic` | yes | Transport address to listen on for announcements (protocol-dependent, wildcards allowed). |
| `field_getters` | yes | How to build the device config from an announcement: one entry per config field, each with a `name` and a [codec](codecs.md) chain applied to the raw message. Two announcements decoding to the same config are the same device. |
| `name_attribute` | no | Name of a `str` attribute of this driver whose value names the discovered device. See [Naming discovered devices](#naming-discovered-devices). |

The attributes present in the announcement are decoded with their own codecs and used as initial values of the new device.

## Naming discovered devices

Without `name_attribute`, a discovered device is named after its config values (for instance its MAC address). With it, Gridone reads the declared attribute once, through its own `read` address rendered with the device config, before creating the device. A non-empty string, trimmed, becomes the device name.

The read happens once, at discovery. A timeout, a decode error, a non-string or a blank value keeps the config-based name, and no later value of the attribute ever renames the device: a name chosen by a user is never overwritten.

`name_attribute` must reference an existing attribute of the driver with `data_type: str`; the driver is rejected otherwise.
