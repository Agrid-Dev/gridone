# Transports

A transport is a configured protocol connection. It is declared once and shared across all devices that speak the same protocol on the same network endpoint.

The transport owns the connection lifecycle: it opens it, keeps it alive, and closes it. Individual device reads and writes are dispatched through it without managing connectivity per device.

---

## Connection lifecycle

Each transport goes through the following states:

| State | Description |
|---|---|
| `idle` | Initialised, not yet connected |
| `connecting` | Connection attempt in progress |
| `connected` | Ready to read and write |
| `connection_error` | Last connection attempt failed |
| `closing` | Graceful shutdown in progress |
| `closed` | Connection released |

Every read and write is gated by a `connected` guard: if the transport is not in the `connected` state when an operation is issued, a connection attempt is made automatically before proceeding. If the attempt fails, the state moves to `connection_error` and the operation is still attempted — the error surfaces to the caller.

Updating a transport's config triggers an automatic reconnect — the transport closes the current connection and reopens it with the new settings.

---

## Configuration per protocol

### HTTP

HTTP is stateless — each read or write sends a new HTTP request. The transport holds a shared async HTTP client that is initialised on connect and reused across requests.

| Field | Required | Default | Description |
|---|---|---|---|
| `request_timeout` | no | `10` | Timeout in seconds applied to every HTTP request |

---

### MQTT

MQTT maintains a persistent connection to a broker. It is push-based: on connect, the transport starts a background message loop that dispatches incoming messages to registered attribute listeners. Any message arriving on a topic that matches a registered attribute's read topic will be parsed through that attribute's codecs and used to update its value — regardless of whether the message was triggered by a read request. In practice, the MQTT transport largely works by listening to topics corresponding to registered device attributes.

**Read flow** — the transport publishes a request message to `request.topic`, subscribes to the response `topic`, and waits up to **10 seconds** for a message to arrive. If no message is received within that window, the read times out. The `request` field in the transport address controls what is published and where.

**Write flow** — the transport publishes the rendered `message` to `topic` as defined in the write address.

| Field | Required | Default | Description |
|---|---|---|---|
| `host` | yes | — | Hostname or IP address of the MQTT broker |
| `port` | no | `1883` | TCP port of the MQTT broker |

---

### Modbus TCP

Modbus TCP maintains a persistent TCP connection to the Modbus server (PLC or gateway). Reads and writes are pull-based: the transport issues a Modbus function code request and waits for a response.

| Field | Required | Default | Description |
|---|---|---|---|
| `host` | yes | — | Hostname or IP address of the Modbus server |
| `port` | no | `502` | TCP port of the Modbus server |

---

### BACnet

BACnet creates a local BACnet/IP application bound to the specified network interface. The `ip_with_mask` identifies that interface. The transport sends and receives BACnet packets over UDP.

| Field | Required | Default | Description |
|---|---|---|---|
| `ip_with_mask` | yes | — | Local interface IP with subnet mask (e.g. `192.168.1.100/24`) |
| `port` | no | `47808` | UDP port for BACnet/IP |
| `local_device_instance` | no | `990001` | BACnet device instance of the Gridone client on the network |
| `local_device_name` | no | `"GridOne BACnet Client"` | BACnet device name of the Gridone client |
| `max_apdu_length` | no | `1024` | Maximum APDU length in bytes |
| `vendor_identifier` | no | `999` | BACnet vendor identifier |
| `segmentation_supported` | no | `noSegmentation` | Segmentation support level |
| `discovery_timeout` | no | `10.0` | Timeout in seconds for device discovery |
| `read_property_timeout` | no | `5.0` | Timeout in seconds for read operations |
| `write_property_timeout` | no | `5.0` | Timeout in seconds for write operations |
| `default_write_priority` | no | `8` | Default BACnet write priority (`5`–`16`) used when no priority is specified in the address |

---

### KNX

KNX uses the KNX/IP tunneling protocol to communicate with a KNX/IP gateway. It is push-based: on connect, a background listener processes all incoming telegrams. Any `GroupValueResponse` or `GroupValueWrite` received on a registered group address is immediately dispatched and updates the corresponding attribute value.

**Read flow** — sends a `GroupValueRead` telegram to the group address and awaits a `GroupValueResponse`. If no response is received within **5 seconds**, the read times out.

**Write flow** — sends a `GroupValueWrite` telegram to the group address.

| Field | Required | Default | Description |
|---|---|---|---|
| `gateway_ip` | yes | — | Hostname or IP address of the KNX/IP gateway (no protocol prefix) |
| `port` | no | `3671` | UDP or TCP port of the KNX/IP gateway |
| `tunneling_mode` | no | `"udp"` | Tunneling transport: `"udp"` or `"tcp"` |
| `secure_credentials` | no | — | KNX Secure credentials — if set, always uses TCP Secure regardless of `tunneling_mode` |

**`secure_credentials` fields:**

| Field | Required | Default | Description |
|---|---|---|---|
| `device_authentication_password` | yes | — | KNX Secure device authentication password |
| `user_password` | yes | — | KNX Secure user password |
| `user_id` | no | `2` | KNX Secure user ID |

