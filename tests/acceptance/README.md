# Gridone acceptance tests

Black-box acceptance tests that run against the production Gridone docker image
through [`@gridone/sdk`](../../sdk/ts). Every run therefore also exercises the
real SDK artifact — its first consumer.

## Stack

`compose.yaml` mirrors the production compose (the `gridone_stack` role in
gridone-infra): same image, same TimescaleDB version, same database user, same
environment variables, same health probes. `compose.override.yaml` adds the
device emulators (mirroring the demo overlay) and is auto-merged by every bare
`docker compose` command — inside this directory the only consumer is the test
stack, so that is intentional.

Deltas from production, each deliberate:

| Delta                                                           | Why                                                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Bridge network + service-name URLs (prod: `network_mode: host`) | Host networking only exists in prod for building-LAN device discovery, untested here; it does not work on macOS Docker Desktop |
| No postgres volume                                              | Fresh database every run: reproducible tests, default `admin`/`admin` auto-created                                             |
| `COOKIE_SECURE=false`, throwaway `SECRET_KEY`                   | Served over plain `http://localhost`; the SDK uses bearer headers anyway                                                       |
| No `restart` policies, no `container_name`                      | Ephemeral stack; fixed names would collide between parallel stacks                                                             |
| Health probe every 5s (prod: 30s)                               | `docker compose up --wait` returns as soon as the app is up                                                                    |
| Emulators have no healthcheck                                   | The thermocktat image is `FROM scratch` (no shell); it serves within milliseconds                                              |

## Running

```sh
# Build the SDK once (tests consume its built dist via file:../../sdk/ts)
npm --prefix ../../sdk/ts ci && npm --prefix ../../sdk/ts run build

npm ci
npm run stack:up    # builds the image from source and waits for healthy
npm run test        # or: npx vitest run --project auth
npm run stack:down  # tears down and wipes the database
```

`stack:up` builds `gridone:acceptance` from the working tree; CI instead
injects a prebuilt image via `GRIDONE_IMAGE`. The stack serves on
`http://localhost:8765` (UI included — handy for debugging).

Environment overrides: `GRIDONE_API` (default `http://localhost:8765/api`),
`GRIDONE_USERNAME` / `GRIDONE_PASSWORD` (default `admin`/`admin`).

## Layout

- `suites/<feature>/` — one directory per feature, mapped to a vitest project
  (`vitest run --project <feature>`) so suites can be selected individually and
  later parallelized in CI.
- Tests never talk to the emulators or the database directly: the public API,
  through the SDK, is the only interface. Payloads are wire-format snake_case,
  per the SDK casing convention.
- No teardown between tests: the stack is ephemeral (`stack:down` wipes the
  volume-less database), so suites seed what they need and leave it.
