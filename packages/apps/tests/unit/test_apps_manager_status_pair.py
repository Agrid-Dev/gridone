"""The (status, status_message) pair of an app: always one a health report
sent, and a message cleaned into storable display text.

Started by an independent tester, whose tests pinned a config save that
reverted the status beside a fresh message.
"""

import json
from unittest.mock import MagicMock

import httpx
import pytest
from conftest import health_response, make_app

from apps.apps_manager import AppsManager
from apps.models import AppStatus

pytestmark = pytest.mark.asyncio

SCHEMA = {"type": "object", "properties": {"lat": {"type": "number"}}}


def schema_response() -> MagicMock:
    response = MagicMock()
    response.json.return_value = SCHEMA
    return response


@pytest.fixture
def apps_manager(app_storage, users_manager, http_client) -> AppsManager:
    return AppsManager(app_storage, users_manager, http_client)


async def test_a_config_save_racing_a_status_flip_stores_a_reported_pair(
    apps_manager, app_storage, http_client
):
    await app_storage.save(
        make_app(status=AppStatus.HEALTHY, status_message="Sent to 14 of 14")
    )

    async def request(_method: str, url: str, **_kwargs: object) -> MagicMock:
        if url.endswith("/config/schema"):
            # `update_config` holds its snapshot; a health tick flips now.
            await app_storage.update_status(
                "app-1", AppStatus.UNHEALTHY, "Upstream unreachable"
            )
            return schema_response()
        return MagicMock()

    http_client.request.side_effect = request

    await apps_manager.update_config("app-1", {"lat": 1.0})

    stored = await app_storage.get_by_id("app-1")
    assert stored is not None
    assert (stored.status, stored.status_message) in {
        (AppStatus.HEALTHY, "Sent to 14 of 14"),
        (AppStatus.UNHEALTHY, "Upstream unreachable"),
    }


async def test_the_next_tick_repairs_a_pair_reverted_by_a_save(
    apps_manager, app_storage, http_client
):
    """A second line of defence: the loop compares the probe to the stored
    pair as a whole, so a pair out of step is rewritten on the next tick."""
    await app_storage.save(
        make_app(status=AppStatus.HEALTHY, status_message="Upstream unreachable")
    )
    http_client.get.return_value = health_response(
        body={"status": "error", "message": "Upstream unreachable"}
    )

    await apps_manager._check_all_apps_health()  # noqa: SLF001

    stored = await app_storage.get_by_id("app-1")
    assert stored is not None
    assert (stored.status, stored.status_message) == (
        AppStatus.UNHEALTHY,
        "Upstream unreachable",
    )


@pytest.mark.parametrize(
    ("reported", "expected"),
    [
        # Cut at 200 characters, not bytes: 250 two-byte characters keep 200.
        pytest.param("é" * 250, "é" * 200, id="non-ascii-cut-by-characters"),
        pytest.param("x" * 200, "x" * 200, id="exactly-200-kept-whole"),
        pytest.param("x" * 201, "x" * 200, id="201-cut"),
        # Inner line breaks are content, only the ends are stripped.
        pytest.param("\n Line 1\nLine 2 \n", "Line 1\nLine 2", id="inner-newline"),
        pytest.param("Room\t101", "Room\t101", id="inner-tab-kept"),
        # Postgres refuses a NUL in text; other control characters are no text.
        pytest.param("Sent\u0000 to 3", "Sent to 3", id="nul-dropped"),
        pytest.param("Line 1\r\nLine 2", "Line 1\nLine 2", id="cr-dropped"),
        pytest.param("Sent\u0007 to\u007f 3", "Sent to 3", id="bell-and-del-dropped"),
        pytest.param("Sent\u0085 to 3", "Sent to 3", id="c1-control-dropped"),
        # Dropped before the cut, so they take no room in the 200.
        pytest.param("\u0000" * 10 + "x" * 200, "x" * 200, id="dropped-before-cut"),
        # UTF-8 cannot encode half an emoji; a whole one stays.
        pytest.param("Sent \ud83d to 3", "Sent \ufffd to 3", id="lone-surrogate"),
        pytest.param("Sent \U0001f600", "Sent \U0001f600", id="whole-emoji-kept"),
        # A cut landing on a blank leaves no trailing blank.
        pytest.param("x" * 199 + " " + "y" * 9, "x" * 199, id="cut-then-stripped"),
    ],
)
async def test_message_normalization_edges(
    reported, expected, apps_manager, app_storage, http_client
):
    await app_storage.save(make_app())
    http_client.get.return_value = httpx.Response(
        200,
        # ASCII-escaped like most JSON encoders' output: a lone surrogate
        # travels as `\ud83d`, which a raw UTF-8 body could not carry.
        content=json.dumps({"status": "ok", "message": reported}).encode(),
        headers={"content-type": "application/json"},
    )

    await apps_manager._check_all_apps_health()  # noqa: SLF001

    stored = await app_storage.get_by_id("app-1")
    assert stored is not None
    assert stored.status_message == expected
