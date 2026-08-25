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
- Assertions go through the public API (via the SDK) only — never the
  database. The one direct emulator contact is deliberate: every emulator's
  http API is published on a host port (`908x`) as the **external
  side-channel**, used to change device state behind gridone's back and assert
  that polling/listening catches it. Payloads are wire-format snake_case, per
  the SDK casing convention.
- No teardown between tests: the stack is ephemeral (`stack:down` wipes the
  volume-less database), so suites seed what they need and leave it.

## Fixtures and their lifetime

A **fixture set** is a driver, a transport, and the devices built on them,
seeded by `seedFixtureSet` in `lib/fixtures.ts`. Every step is get-or-create, so
re-seeding a live stack reuses what is there.

Where a set is declared says who owns it:

- **Shared** (`http`, `modbus`, `mqtt`, `knx`, `bacnet`) — `setup/globalSetup.ts`,
  seeded once per run, read with `inject("devicesByFixture")[key]`. The
  `SharedFixtureKey` union closes that record, so reaching for a suite-owned set
  from the shared context is a compile error.
- **Suite-owned** — declared in the suite and seeded in its `beforeAll`
  (`connectionStatus.spec.ts`, `opcua.spec.ts`). Nothing else can build on it and
  a seeding failure fails one file, not the run. A suite needing a device state
  the golden path forbids (unreachable, faulty) takes its own emulator this way,
  since emulator state is shared by every device pointed at it.

Add to `globalSetup` only what more than one suite depends on.

Fixture sets are torn down by `stack:down` and nothing else. Suites must not
delete them — they are shared, projects run in parallel, and get-or-create means
they never accumulate. Resources a test creates at runtime are per-run, uniquely
named (`…-${Date.now()}`) and unbounded, so those suites drain a `createdIds`
list in `afterEach`.

Leaving fixtures in place is deliberate: a non-fresh stack is the state a real
deployment is always in, and the residue carries signal the suites rely on —
accumulated read history, timeseries bounded by `runStart`, and re-seeding
conflicts that have surfaced real bugs.

`connectionStatus.spec.ts` owns `thermocktat-connection-status` (`9087`) and
stops and starts it via `lib/emulator.ts`. It is the one
suite needing a local Docker socket: it fails, rather than skips, against a
remote `GRIDONE_API`.
