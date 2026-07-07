# @gridone/sdk

TypeScript client for the Gridone API. Runs in the browser and Node 18+, with zero runtime dependencies.

API payloads keep the **wire format** — snake_case keys, exactly as documented in the OpenAPI schema. SDK code (classes, methods, config) is idiomatic camelCase.

> **Status**: under construction ([AGR-375](https://linear.app/agrid-bms/issue/AGR-375)) — `client.devices`, `client.drivers`, `client.transports` and `client.timeseries` are available; remaining namespaces (`assets`, `users`, `apps`, ...) are coming. `client.request()` reaches any endpoint in the meantime.

## Usage

```ts
import { GridoneClient, isNotFound } from "@gridone/sdk";

const client = new GridoneClient({ baseUrl: "http://localhost:8000" });

await client.login("admin", "s3cret");

const devices = await client.devices.list({ search: "fan" });
await client.devices.sendCommand(devices[0].id, {
  attribute: "setpoint",
  value: 21.5,
  confirm: true,
});

const points = await client.timeseries.getPoints(
  devices[0].id,
  "active_power",
  { last: "24h" },
);

try {
  await client.devices.get("nope");
} catch (error) {
  if (isNotFound(error)) {
    // GridoneError with .status and .detail; NetworkError when unreachable
  }
}

await client.logout();
```

Endpoints without a namespace method yet are reachable with the raw escape hatch:

```ts
await client.request("POST", "/notifications/", { body: { ... } });
```

Tokens are held in a `MemoryTokenStorage` by default (lifetime of the client). Pass your own `TokenStorage` implementation for other lifetimes — e.g. a cookie-backed one in the browser. Expired access tokens are refreshed transparently: on a 401 the client exchanges the refresh token (one refresh shared across concurrent requests) and retries once.

For testing or Node-side tuning, inject a custom `fetch` via the config (`{ fetch: myFetch }`).

## Types

All API request and response types are exported, in wire format:

```ts
import type {
  Device,
  DeviceCreate,
  Transport,
  Page,
  UnitCommand,
} from "@gridone/sdk";
```

They are generated from the OpenAPI schema (`openapi-typescript`) into `src/generated/openapi.ts` and re-exported under stable names by `src/types.ts` — see its header for the few renames (`Driver`, `TimeSeries`, `Page<T>`, the `Transport` union). The raw `paths` / `components` / `operations` types are exported too for endpoint-level lookups.

After changing the API, regenerate and commit the result:

```sh
npm run generate-types  # regenerates docs/src/openapi.json, then src/generated/openapi.ts
```

`src/types.spec.ts` contains compile-time assertions that fail `tsc` if the hand-written shapes drift from the generated ones.

## Development

```sh
npm install
npm run build       # tsup — ESM + CJS + type declarations in dist/
npm run test        # vitest
npm run lint        # eslint
npm run format -- --check
npm run type-check  # tsc --noEmit
```
