# Claude x Gridone

## Project context

This project is a building management system (BMS) implemented in python. The goal of this software is to provide users control over their building's equipments (chillers, thermostats, boilers...), record data and metrics from them and automate workflows.

It is at the core of its design to be extensible. Extensible in several directions:
- *devices support* (in `devices-manager`): new devices can be easily added using yaml-based drivers, a registry of transport clients for many protocols (http, mqtt, bacnet, modbus...), and value adapters that can convert raw device values to internal data types. The source code must never mention a specific device or vendor - all vendor specific data lives in a driver file as input data;
- *api-first*: features of the BMS needs to be basic and very robust, but it offers an easy-to-use and performant http API to serve as a platform for developping building applications for specific use cases (and later, also a Model Context Protocol controller, as well as language-specific client libraries / sdks).

To summarize: the key of this project is extensibility and ease of deployment for users.

## Project structure

This project is a monorepo.

It has a python backend split into components in `packages/`. Each component handles a specific module or feature of the system, is responsible for its storage and exposes a high-level API. The `api` package is an http controller that bootstraps all components.

The `apps` directory contains apps that can actually run. It has a server that runs the API, a cli tool (mainly for testing), and a UI web application built with react and typescript.

Dependencies for python are managed with [`uv`](https://docs.astral.sh/uv/) workspaces.

```
.
├── CLAUDE.md
├── README.md
├── apps
│   ├── api_server
│   │   ├── README.md
│   │   ├── logging_config.py
│   │   ├── main.py
│   │   └── pyproject.toml
│   ├── cli
│   │   ├── README.md
│   │   ├── pyproject.toml
│   │   ├── src
│   │   └── tests
│   └── ui
│       ├── README.md
│       ├── components.json
│       ├── dist
│       ├── eslint.config.mts
│       ├── index.css
│       ├── index.html
│       ├── node_modules
│       ├── package-lock.json
│       ├── package.json
│       ├── postcss.config.js
│       ├── src
│       ├── tailwind.config.js
│       ├── tsconfig.app.json
│       ├── tsconfig.json
│       ├── tsconfig.node.json
│       └── vite.config.ts
├── config.yaml
├── docker
│   ├── Dockerfile
│   ├── nginx.conf
│   └── supervisord.conf
├── node_modules
├── packages
│   ├── api
│   │   ├── README.md
│   │   ├── pyproject.toml
│   │   ├── src
│   │   └── tests
│   ├── assets
│   │   └── src
│   ├── devices_manager
│   │   ├── README.md
│   │   ├── pyproject.toml
│   │   ├── src
│   │   └── tests
│   ├── models
│   │   ├── README.md
│   │   ├── pyproject.toml
│   │   └── src
│   ├── timeseries
│   │   ├── README.md
│   │   ├── pyproject.toml
│   │   ├── src
│   │   └── tests
│   └── users
│       ├── README.md
│       ├── pyproject.toml
│       └── src
├── pyproject.toml
└── uv.lock
```

## Tools

### Python

Python packages all use `ruff` for linting and formatting, `ty` for type-checking and `pytest` for tests.

After each modification, ensure all their rules are respected. You can run `prek run --all-files` to check all hooks.

### Typescript

The `apps/ui` typescript / react project uses:

- `eslint` for linting (`npm run lint`)
- `prettier` for formatting (`npm run format -- --write`)
- `typescript` for type-checking (`npm run type-check`)
- `vitest` / RTL for tests (`npm run test`)

See `package.json` for more info.

## Best practices

- Enforce all quality tools
- Target ~90% coverage (with the exception of UI, where you can only test critical components)
- Respect the project architecture, drive it towards long-term maintenability
- Help improve the CI workflows for fast feedback
- When moving files, use `git mv` to preserve history rather than deleting / recreating them

## Coding standards

These rules MUST be followed when writing or modifying code. This is a living document — update it as new patterns emerge or rules evolve.

### Architecture

#### 1. Dependency direction is strictly downward

```
apps/ -> packages/api -> packages/<service> -> packages/models
```

Never import upward or sideways between service packages. Each service package is independent; only `packages/api` (the controller) and `apps/` (the composition roots) may wire them together.

#### 2. Services depend on interfaces, not implementations

When service A needs service B, inject a `Protocol` or abstract class. Only the composition root (`main.py` / `app.py`) imports concrete implementations.

```python
# BAD
from users.manager import UsersManager

class AppsManager:
    def __init__(self, storage, users_manager: UsersManager): ...
```

```python
# GOOD
from users.interface import UsersManagerInterface

class AppsManager:
    def __init__(self, storage, users_manager: UsersManagerInterface): ...
```

#### 3. Don't abstract prematurely

Only create an interface/Protocol when there are (or will soon be) multiple implementations. A single concrete class behind an abstraction adds indirection without value. Start concrete and extract an interface when the second implementation arrives.

#### 4. Service packages must not depend on any controller framework

No `fastapi` (or any other controller framework) imports inside service packages. Framework-specific code lives in `packages/api`. This ensures services remain reusable across controllers (HTTP, MCP, CLI, etc.).

#### 5. Storage internals stay in `/storage`

The manager never imports `*InDB` models, never references a specific storage technology by name, and never builds raw queries. Storage methods accept and return domain models. The storage layer also owns its own lifecycle — background tasks, connection pooling, cleanup, and migrations. The manager delegates to the storage's start/stop methods rather than orchestrating storage internals.

```python
# BAD
def get_user(self, user_id: str) -> UserInDB:
    return self.storage.get(user_id)
```

```python
# GOOD
def get_user(self, user_id: str) -> User:
    user_in_db = self.storage.get(user_id)
    return user_in_db.to_domain()
```

#### 6. No cross-component database references

A service must never reference another service's database schema — no foreign keys, joins, or shared tables across package boundaries. If service A needs data from service B, it calls B's interface at the application level. Each service owns its schema exclusively.

```python
# BAD (in timeseries storage)
SELECT ts.value FROM timeseries ts
JOIN devices_manager.devices d ON d.id = ts.device_id

# GOOD
# timeseries stores device_id as an opaque string;
# the API layer joins data from both services if needed
```

#### 7. Encapsulate service bootstrap

Use a factory method instead of exposing storage factories to the API layer.

```python
# BAD (in app.py)
from users.storage.postgres import PostgresUsersStorage, run_migrations
storage = PostgresUsersStorage(url)
await run_migrations(url)
users_manager = UsersManager(storage)
```

```python
# GOOD (in app.py)
users_manager = await UsersManager.from_storage(settings.storage_url)
```

#### 8. Defaults belong in one place

Define parameter defaults at the service level. Don't duplicate them at API and DB levels.

### Testing

#### 9. Test at the right level

| Test type | What to mock | Auth handling |
|-----------|-------------|---------------|
| Router unit test | The service itself (`AsyncMock(spec=...)`) | Override `get_current_user_id` |
| Service unit test | The storage backend | N/A |
| Integration test | Nothing — use real DB | Full stack |

```python
# BAD: router test mocks the service's internal storage
@pytest.fixture
def apps_manager():
    storage = AsyncMock(spec=StorageBackend)
    users_storage = AsyncMock(spec=UsersStorageBackend)
    return AppsManager(storage, UsersManager(users_storage))
```

```python
# GOOD: router test mocks the service itself
@pytest.fixture
def apps_manager():
    return AsyncMock(spec=AppsManagerInterface)
```

#### 10. Test auth/permissions once

Maintain a single `test_authorization.py` that verifies endpoint-to-permission wiring. Do **not** duplicate `*_forbidden` / `*_no_auth` tests in every router test file.

```python
# GOOD: centralized parametrized permission tests
ACCESS_CONTROL_SCENARIOS = [
    ("block_admin",    "admin",    "POST", "/users/{id}/block", 200),
    ("block_operator", "operator", "POST", "/users/{id}/block", 403),
    ("block_no_auth",  None,       "POST", "/users/{id}/block", 401),
]

@pytest.mark.parametrize("test_id,role,method,path,expected", ACCESS_CONTROL_SCENARIOS)
def test_access_control(test_id, role, method, path, expected): ...
```

#### 11. Mirror test structure to source

`packages/<pkg>/src/<pkg>/manager.py` maps to `packages/<pkg>/tests/unit/test_manager.py`.

Storage model tests go under `tests/unit/storage/`.

#### 12. Cover edge cases and error paths

Target **90% coverage** overall, **100% on critical paths** (not found, circular refs, constraint violations). Use parametrized tests for tabular scenarios.

### Code quality

#### 13. Don't reimplement existing utilities

Before adding error handling in a route, check `exception_handlers.py`. Before adding auth checks, check existing dependencies. Before creating a new method, check if an existing one can be extended with a parameter.

```python
# BAD: duplicating exception_handlers
@router.post("/users/{id}/block")
async def block_user(id: str):
    try:
        await users_manager.block_user(id)
    except NotFoundError:
        raise HTTPException(status_code=404)
```

```python
# GOOD: let the global exception handler do its job
@router.post("/users/{id}/block")
async def block_user(id: str):
    await users_manager.block_user(id)
    # NotFoundError -> 404 is handled by exception_handlers.py
```

#### 14. Use domain-specific types

No `dict` where a model works. No repeated string literals where an enum or type alias works. Use pydantic models with `Field` validation instead of manual checks.

#### 15. One term per concept (ubiquitous language)

Pick one name for each domain concept and use it everywhere — code, UI, docs, API.

#### 16. Name files and methods generically

`from_storage()` not `from_postgres()`. Match existing naming conventions.

#### 17. One function, one job

Extract conversion, formatting, and side-effect logic into separate methods. Manager methods should read as a sequence of high-level steps, not contain inline transformations. Storage operations should be one-liners in the manager.

```python
# BAD
async def export_series(self, device_id: str, start: datetime, end: datetime) -> str:
    series = await self.storage.get_series(device_id, start, end)
    csv_lines = [",".join(s.headers) for s in series]
    for s in series:
        csv_lines.extend([",".join(str(v) for v in row) for row in s.data])
    return "\n".join(csv_lines)
```

```python
# GOOD
async def export_series(self, device_id: str, start: datetime, end: datetime) -> str:
    series = await self.storage.get_series(device_id, start, end)
    return series_to_csv(series)
```

#### 18. Never leak internal errors to clients

Do not pass `str(e)` or exception messages into API responses. Internal errors may expose file paths, SQL, or stack details. Use generic messages in error responses; log the full error server-side.

```python
# BAD
except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))

# GOOD
except Exception:
    logger.exception("Unexpected error during operation")
    raise HTTPException(status_code=500, detail="Internal server error")
```

#### 19. Return values through the call chain

When a function creates or mutates a resource, return the result directly. Do not discard the return value and re-fetch from storage.

```python
# BAD
async def create_user(self, params):
    user_id = generate_id()
    await self.storage.insert(User(id=user_id, ...))
    return await self.storage.get(user_id)  # unnecessary round-trip

# GOOD
async def create_user(self, params):
    user = User(id=generate_id(), ...)
    await self.storage.insert(user)
    return user
```

#### 20. Use short random IDs

Use 16-character hex strings (e.g., `uuid4().hex[:16]`) instead of full UUIDs for entity identifiers. They are shorter, more readable in logs and URLs, and still provide sufficient collision resistance.

#### 21. Add docstrings for non-obvious logic

Any function containing regex, bit manipulation, protocol-specific encoding, or multi-step algorithms must have a docstring explaining what it does and why. Regex patterns should include an example of what they match.

### Frontend

#### 22. All forms use react-hook-form + zod

Generate zod schemas from JSON schemas when available (`z.fromJSONSchema()`). Use shadcn `Field`, `FieldLabel`, and `data-invalid` for error states.

#### 23. One route per action

| Route | Purpose |
|-------|---------|
| `/resources` | List |
| `/resources/:id` | Detail |
| `/resources/new` | Create |
| `/resources/:id/edit` | Edit |

#### 24. Extract shared UI components

`NotFound`, `ResourceEmpty`, error boundaries — create once, reuse everywhere.

#### 25. Create TypeScript types for repeated unions

```typescript
// BAD
role: "admin" | "operator" | "viewer"  // repeated in 5 files

// GOOD
type UserRole = "admin" | "operator" | "viewer";
```

#### 26. Separate logic from JSX

Put API calls, state management, and data transformations in custom hooks or context providers. Components should focus on rendering.

```tsx
// BAD
function DeviceList() {
  const [devices, setDevices] = useState([]);
  useEffect(() => { fetch("/api/devices").then(...) }, []);
  return <ul>{devices.map(d => <li>{d.name}</li>)}</ul>;
}

// GOOD
function DeviceList() {
  const { devices } = useDevices();
  return <ul>{devices.map(d => <li>{d.name}</li>)}</ul>;
}
```

### Devices manager

#### 27. Value adapters are composable

Build small, single-purpose adapters (e.g., `byte_convert`, `slice`, `json_pointer`) that can be chained in driver YAML. Do not create combined adapters (e.g., `byte_slice`) that duplicate logic from existing ones. Each adapter does one transformation; the driver composes them.

### Pre-PR checklist

#### Architecture

- [ ] No service imports another service's concrete class (only interfaces/protocols)
- [ ] Interfaces only exist when there are multiple implementations (no premature abstraction)
- [ ] No service package imports a controller framework (FastAPI, etc.)
- [ ] No storage model (`*InDB`) is exposed outside the `/storage` directory
- [ ] No storage implementation detail is mentioned outside `/storage`
- [ ] Storage layer manages its own lifecycle (background tasks, connections, migrations)
- [ ] No cross-service database references (foreign keys, joins across package schemas)
- [ ] Service bootstrap is encapsulated (factory method, not raw storage init in `app.py`)
- [ ] Defaults are defined in exactly one place (service level)

#### Testing

- [ ] Router tests mock the service, not the service's storage
- [ ] Router tests override `get_current_user_id`, not the full auth flow
- [ ] Auth/permission tests are NOT duplicated — they live in `test_authorization.py`
- [ ] Test files mirror source structure
- [ ] Edge cases and error paths are covered
- [ ] Patch coverage >= 90%
- [ ] Parametrized tests used for repetitive scenarios

#### Code quality

- [ ] No reimplemented logic — checked existing `exception_handlers`, utilities, shared models
- [ ] Typed models used instead of `dict` where applicable
- [ ] Consistent naming — no synonyms for the same concept
- [ ] File/method names follow existing conventions
- [ ] Functions do one thing — no inline conversions or mixed concerns
- [ ] No raw exception messages in API responses (no `str(e)` in HTTPException detail)
- [ ] Mutation methods return their result directly (no re-fetch after create/update)
- [ ] Entity IDs use 16-char hex strings, not full UUIDs
- [ ] Non-obvious logic (regex, algorithms) has docstrings

#### Frontend (if applicable)

- [ ] Forms use react-hook-form + zod
- [ ] Routes follow CRUD pattern
- [ ] Shared components reused
- [ ] TypeScript types defined for repeated unions
- [ ] API calls and state logic live in hooks/context, not in component JSX

#### Quality gates

- [ ] `prek run --all-files` passes
- [ ] `npm run lint && npm run format -- --check && npm run type-check` passes (if UI changes)
- [ ] Tests pass: `pytest` (backend), `npm run test` (frontend)

## Useful commands

```sh
# Run git hooks with prek
prek run -a
prek run --stage pre-commit
prek run --stage pre-push
```
