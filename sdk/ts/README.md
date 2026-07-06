# @gridone/sdk

TypeScript client for the Gridone API. Runs in the browser and Node 18+, with zero runtime dependencies.

API payloads keep the **wire format** — snake_case keys, exactly as documented in the OpenAPI schema. SDK code (classes, methods, config) is idiomatic camelCase.

> **Status**: under construction ([AGR-373](https://linear.app/agrid-bms/issue/AGR-373)) — resource namespaces (`client.devices`, ...) and generated types are coming; until then `client.request()` reaches any endpoint.

## Usage

```ts
import { GridoneClient, isNotFound } from "@gridone/sdk";

const client = new GridoneClient({ baseUrl: "http://localhost:8000" });

await client.login("admin", "s3cret");

const devices = await client.request<{ items: unknown[] }>("GET", "/devices", {
  searchParams: { page_size: 50 },
});

try {
  await client.request("GET", "/devices/nope");
} catch (error) {
  if (isNotFound(error)) {
    // GridoneError with .status and .detail; NetworkError when unreachable
  }
}

await client.logout();
```

Tokens are held in a `MemoryTokenStorage` by default (lifetime of the client). Pass your own `TokenStorage` implementation for other lifetimes — e.g. a cookie-backed one in the browser. Expired access tokens are refreshed transparently: on a 401 the client exchanges the refresh token (one refresh shared across concurrent requests) and retries once.

For testing or Node-side tuning, inject a custom `fetch` via the config (`{ fetch: myFetch }`).

## Development

```sh
npm install
npm run build       # tsup — ESM + CJS + type declarations in dist/
npm run test        # vitest
npm run lint        # eslint
npm run format -- --check
npm run type-check  # tsc --noEmit
```
