# Transports

A [network](glossary.md#network) is a configured protocol connection. It is declared once and shared across all [devices](glossary.md#device) that speak the same protocol on the same network endpoint.

The network owns the connection lifecycle: it opens it, keeps it alive, and closes it. Individual device reads and writes are dispatched through it without managing connectivity per device.

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
| `tls` | no | `false` | Enables `mqtts` (TLS/mTLS) |
| `ca_cert` | no | — | PEM-encoded CA certificate used to validate the broker's certificate |
| `client_cert` | no | — | PEM-encoded client certificate presented to the broker (mTLS) |
| `client_key` | no | — | PEM-encoded private key matching `client_cert` |
| `username` | no | — | Username, for brokers combining mTLS with user auth |
| `password` | no | — | Password, for brokers combining mTLS with user auth |

TLS brokers conventionally listen on **8883**, not the plain-mqtt default of
**1883** — `port` does not change automatically when `tls: true` is set.
Connecting with `tls: true` to a plaintext port (or vice versa) fails as a
connection timeout, not a clear error, so double-check the port matches the
broker's actual listener.

```yaml
transport:
  name: site-mqtts
  protocol: mqtt
  config:
    host: broker.example.com
    port: 8883
    tls: true
    ca_cert: |
      -----BEGIN CERTIFICATE-----
      ...
      -----END CERTIFICATE-----
    client_cert: |
      -----BEGIN CERTIFICATE-----
      ...
      -----END CERTIFICATE-----
    client_key: |
      -----BEGIN PRIVATE KEY-----
      ...
      -----END PRIVATE KEY-----
```

---

### Modbus TCP

Modbus TCP maintains a persistent TCP connection to the Modbus server (PLC or gateway). Reads and writes are pull-based: the transport issues a Modbus function code request and waits for a response.

| Field | Required | Default | Description |
|---|---|---|---|
| `host` | yes | — | Hostname or IP address of the Modbus server |
| `port` | no | `502` | TCP port of the Modbus server |

---

### M-Bus

M-Bus connects to an M-Bus/TCP gateway over RFC 2217. Reads are pull-based: the transport requests a meter's data by primary address and parses the response. It is read-only.

| Field | Required | Default | Description |
|---|---|---|---|
| `host` | yes | — | Hostname or IP address of the M-Bus/TCP gateway |
| `port` | yes | — | TCP port of the gateway |
| `baud_rate` | no | `2400` | Serial baud rate negotiated with the gateway |

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
| `secure_device_authentication_password` | no | — | KNX IP-Secure device authentication password |
| `secure_user_password` | no | — | KNX IP-Secure user password |
| `secure_user_id` | no | `2` | KNX IP-Secure tunnel user ID |

**KNX IP-Secure** is enabled by setting **both** `secure_device_authentication_password` and `secure_user_password` (setting only one of them is a validation error). When enabled, the connection always uses TCP Secure regardless of `tunneling_mode`.

---

### Webhook

Webhook is the HTTP-ingress counterpart of MQTT: instead of Gridone subscribing to a broker, external producers push messages **to** Gridone over HTTP. It is push-based and **ingress-only** — the transport cannot solicit data and does not support writes.

Messages enter through the API:

```
POST /transports/{transport_id}/ingress/{topic}
```

Everything after `/ingress/` is the **topic** (it may contain slashes, e.g. `room1/snapshot`). The raw request body is the message payload. Topics are matched **exactly** against the read topics of registered device attributes — no MQTT-style wildcards. A push on a topic with no subscribed attribute returns `200 {"matched": 0}`: this is a valid outcome (for example a push racing device provisioning), not an error.

**Read flow** — not supported. The transport cannot solicit data, so on-demand reads (refresh, `read_device`) fail with a `422`; attribute values only move when a message is pushed. For the same reason webhook drivers must not poll: an explicit `polling_enabled: true` is rejected at driver validation, and a driver that omits the setting gets polling disabled automatically.

**Write flow** — not supported.

**Authentication** — the ingress endpoint is outside the API's user-authorization flow (this is device-level ingestion, like MQTT or BACnet credentials). The transport verifies each push itself, according to its config:

| Scheme | How to push |
|---|---|
| `bearer` | Send `Authorization: Bearer <secret>` |
| `hmac_sha256` | Send `x-signature-256: sha256=<hexdigest>`, where the digest is HMAC-SHA256 of the raw request body keyed with `secret` (GitHub webhook convention) |
| `none` | No credentials checked |

A failed check returns `401` with a generic message. Request bodies are capped at **1 MiB**.

| Field | Required | Default | Description |
|---|---|---|---|
| `auth` | no | `bearer` | Authentication scheme: `none`, `bearer` or `hmac_sha256` |
| `secret` | required unless `auth: none` | — | Shared secret used to verify pushes |

**Device health** — a webhook has no connection to monitor. Declare `healthcheck.expected_push_interval` in the driver: the device is marked `degraded` after 2× the interval without a push, then `error` after 3×.

```yaml
transport:
  name: app-ingress
  protocol: webhook
  config:
    auth: bearer
    secret: my-shared-secret
```

Example push:

```sh
curl -X POST "https://gridone.example.com/api/transports/<transport_id>/ingress/room1/snapshot" \
  -H "Authorization: Bearer my-shared-secret" \
  -H "Content-Type: application/json" \
  -d '{"temperature": 21.5, "humidity": 55}'
```

---

### OPC-UA

OPC-UA maintains a persistent session to a server. It is pull-based by default — reads go through the OPC-UA Read service with push available per attribute via subscriptions (`push: true` on the attribute, see [General Layout](driver-schema/general-layout.md)): the transport opens one `Subscription` for the session and adds a `MonitoredItem` per subscribed NodeId, delivering data-change notifications instead of polling.

**Read flow** — a single address read uses the OPC-UA Read service against that NodeId. Multiple addresses in the same sweep are batched into one Read service call instead of one request per address.

**Write flow** — the transport reads the NodeId's server-declared variant type first, then writes the coerced value as that type.

**Push flow** (opt-in per attribute) — a subscribed NodeId is added as a `MonitoredItem` on the transport's `Subscription`. `sampling_interval_ms` and `deadband` control how the server reports changes; a `Bad` status quality drops the notification, `Uncertain` is still delivered.

| Field | Required | Default | Description |
|---|---|---|---|
| `endpoint_url` | yes | — | Server endpoint, e.g. `opc.tcp://host:port/path` |
| `auth_mode` | no | `anonymous` | `anonymous` or `username_password` |
| `username` | no | — | Required if `auth_mode` is `username_password` |
| `password` | no | — | Required if `auth_mode` is `username_password` |
| `connect_timeout` | no | `10` | Seconds to establish the session |
| `request_timeout` | no | `5` | Seconds per Read/Write service call |
| `keepalive_interval` | no | `5` | Seconds between session keepalive pings |
| `sampling_interval_ms` | no | `1000` | Sampling interval, in milliseconds, requested for every `MonitoredItem` |
| `deadband` | no | `0` | Absolute deadband applied to push notifications; `0` reports every change |
| `security_policy` | no | `None` | `None`, `Basic256Sha256`, `Aes128Sha256RsaOaep` or `Aes256Sha256RsaPss` |
| `security_mode` | no | `None` | `None`, `Sign` or `SignAndEncrypt` |

`security_policy` and `security_mode` must both be `None`, or both set to a non-`None` value — one without the other is rejected.

```yaml
transport:
  name: chiller-opcua
  protocol: opcua
  config:
    endpoint_url: opc.tcp://10.0.1.20:4840
    auth_mode: anonymous
```

#### Secure channel

Setting `security_policy`/`security_mode` enables OPC-UA's own mutual X.509 secure channel — a separate handshake from user auth (`auth_mode` composes freely with any policy/mode pair). Gridone generates and keeps one application-instance certificate for the whole instance under `GRIDONE_OPCUA_PKI_DIR` (default `~/.gridone/opcua-pki`) — this directory must be persisted across restarts, since every server an operator has trusted has trusted that specific certificate.

Server trust is pin-on-first-use: the certificate a server presents on first connect is written to the PKI directory and required byte-for-byte on every later connect. Because a server also has to trust *gridone's* certificate before it will accept a session, and nothing gridone does client-side can make that happen, connecting to a new server for the first time takes a manual step:

1. Configure the transport and let it attempt to connect. The attempt fails and the transport parks in an error state — this failed attempt is what puts gridone's certificate in front of the server.
2. On the server, find gridone's certificate in its rejected-certificates list and move it to the trusted list (vendor-specific UI/certificate store).
3. Trigger a reconnect: `POST /transports/{id}/reconnect`. This step is required — a rejected secure channel is a terminal error and gridone will not retry on its own.

If a server later rotates its certificate, gridone refuses the new one (the pin no longer matches). Accepting it means deleting the pinned certificate file for that server under the PKI directory and reconnecting, which re-runs the first-use step above.

`Basic128Rsa15` and `Basic256` are not offered — the OPC Foundation withdrew both.

