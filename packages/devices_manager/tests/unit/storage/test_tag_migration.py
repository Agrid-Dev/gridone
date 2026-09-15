import runpy
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from devices_manager.storage.postgres import device_storage


def migration():
    path = (
        Path(device_storage.__file__).parent
        / "migrations"
        / "0009.devices-manager-multivalued-tags.py"
    )
    with patch("yoyo.step"):
        return runpy.run_path(str(path))["migrate"]


@pytest.mark.parametrize(
    "rows", [[("a", "bad key", "east")], [("a", "ecs", "East"), ("b", "ECS", "east")]]
)
def test_preflight_rejects_invalid_or_colliding_tags_before_any_write(rows):
    connection = MagicMock()
    cursor = connection.cursor.return_value
    cursor.fetchall.return_value = rows
    with pytest.raises(ValueError, match=r"Invalid legacy|collision"):
        migration()(connection)
    cursor.execute.assert_called_once_with(
        "SELECT device_id, key, value FROM dm_device_tags"
    )
    cursor.executemany.assert_not_called()


def test_preflight_canonicalizes_unicode_legacy_tags_without_losing_rows():
    connection = MagicMock()
    cursor = connection.cursor.return_value
    cursor.fetchall.return_value = [
        ("a", "Étage", "2"),
        ("b", "Étage", "2"),
        ("b", "ecs", "East"),
    ]
    migration()(connection)
    assert cursor.executemany.call_args.args[1] == [
        ("a", "étage", "2"),
        ("b", "étage", "2"),
        ("b", "ecs", "east"),
    ]
