import pytest

from users.permissions import IMPLIES, Permission, effective

WRITES = [p for p in Permission if not p.endswith(":read")]


def test_every_write_states_what_it_implies():
    assert sorted(IMPLIES) == sorted(WRITES)


@pytest.mark.parametrize("permission", [p for p in WRITES if IMPLIES[p]])
def test_a_write_implies_reading_its_own_resource(permission: Permission):
    resource = permission.split(":")[0]
    assert IMPLIES[permission] == {Permission(f"{resource}:read")}


def test_effective_adds_what_each_permission_implies():
    assert effective([Permission.DEVICES_COMMAND, Permission.ASSETS_WRITE]) == {
        Permission.DEVICES_COMMAND,
        Permission.DEVICES_READ,
        Permission.ASSETS_WRITE,
        Permission.ASSETS_READ,
    }


@pytest.mark.parametrize(
    "held",
    [
        pytest.param([], id="nothing"),
        pytest.param([Permission.DEVICES_READ], id="a-read"),
        pytest.param([Permission.NOTIFICATIONS_WRITE], id="notifications-write"),
    ],
)
def test_effective_adds_nothing_when_nothing_is_implied(held: list[Permission]):
    assert effective(held) == set(held)
