# Plan: Fix PR #139 Coverage (74.89% → ≥76%)

## Problem
Codecov patch check fails: 74.89% of diff lines are hit, target is 75.98%. The main uncovered **diff lines** are in:

| File | Patch coverage | Missed diff lines |
|---|---|---|
| `packages/api/src/api/app.py` | 27.27% (8 lines missed) | L6 (import), L24 (import), L56-61 (apps_mgr try/except), L105-106 (apps_mgr close), L120 (include_router) |
| `packages/api/src/api/dependencies.py` | 66.67% (1 line missed) | L31 (`get_apps_manager` body) |
| `packages/apps/src/apps/manager.py` | 94.12% (4 lines missed) | L29 (`close`), L35-38 (`from_storage` factory) |

**Note:** `app.py` and `dependencies.py` lines are mostly uncovered because the existing API tests use lightweight `TestClient` fixtures that bypass `lifespan`. That's fine — we should NOT test integration startup in unit tests. The cheapest wins are the `manager.py` lines + the `dependencies.py` line.

---

## Plan

### 1. Cover `AppsManager.close()` and `AppsManager.from_storage()` (manager.py L29, L35-38)

In `packages/apps/tests/unit/test_apps_manager.py`:
- **Add a test for `close()`**: create an `AppsManager` with the in-memory storage double, call `await mgr.close()`, assert storage's `close()` was called.
- **Add a test for `from_storage()` failure path**: call `AppsManager.from_storage("not-postgres", mock_um)` and assert it raises `ValueError` (since the factory rejects non-postgres URLs). This covers L35-38 via the factory delegation.

### 2. Cover `get_apps_manager` (dependencies.py L31)

In `packages/api/tests/routes/test_registration_router.py`, the test fixture already overrides `get_apps_manager` via `app.dependency_overrides`. The function body itself (line 31: `return request.app.state.apps_manager`) is never actually executed because it's fully replaced by the override.

**Fix:** Add a tiny unit test in `packages/api/tests/` (e.g. `test_dependencies.py` or inline in an existing test file) that directly calls `get_apps_manager(mock_request)` where `mock_request.app.state.apps_manager` is set. This covers the 1 missed line.

### 3. Verify lint passes

Run `prek run --all-files` to ensure ruff/formatting/type-checks are clean.

---

## Expected Impact

- `manager.py`: +4 lines covered → patch goes from 94.12% to 100%
- `dependencies.py`: +1 line → patch goes from 66.67% to 100%
- Total: ~5 more diff lines covered out of ~227 total, pushing from 74.89% to ~77%+ (above the 75.98% target)

## Files to Modify
1. `packages/apps/tests/unit/test_apps_manager.py` — add `close()` + `from_storage()` tests
2. `packages/api/tests/routes/test_dependencies.py` (new) or `test_registration_router.py` — add `get_apps_manager` unit test
