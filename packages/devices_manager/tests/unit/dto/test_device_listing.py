from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from unittest.mock import MagicMock

import pytest

from devices_manager.core.device.connection_status_attribute import (
    CONNECTION_STATUS_ATTR,
    build_cs_attribute,
)
from devices_manager.dto import (
    Device,
    DeviceHealth,
    DeviceListing,
    DeviceSortKey,
)
from devices_manager.types import ConnectionStatus
from models.pagination import PaginationParams


@dataclass
class _Attribute:
    current_value: object | None


@dataclass
class _Header:
    """What a listing reads before converting: a stand-in is enough."""

    id: str
    name: str
    type: str | None = None
    is_faulty: bool = False
    attributes: dict = field(default_factory=dict)


def _header(
    device_id: str,
    name: str,
    *,
    device_type: str | None = None,
    faulty: bool = False,
    status: ConnectionStatus | str | None = None,
) -> _Header:
    attributes = (
        {} if status is None else {CONNECTION_STATUS_ATTR: build_cs_attribute(status)}
    )
    return _Header(device_id, name, device_type, faulty, attributes)


def _public(header: _Header) -> Device:
    now = datetime(2026, 1, 1, tzinfo=UTC)
    return Device(
        id=header.id,
        name=header.name,
        type=header.type,
        config={},
        driver_id="drv",
        transport_id="tr",
        created_at=now,
        updated_at=now,
    )


def _listing(*headers: _Header) -> tuple[DeviceListing[_Header], MagicMock]:
    convert = MagicMock(side_effect=_public)
    return DeviceListing(headers, convert=convert), convert


class TestCounting:
    def test_total_and_len_count_the_match_without_converting(self):
        listing, convert = _listing(_header("a", "A"), _header("b", "B"))

        assert listing.total == 2
        assert len(listing) == 2
        assert bool(listing) is True
        convert.assert_not_called()

    def test_an_empty_listing_is_falsy(self):
        listing, _ = _listing()

        assert not listing
        assert listing.total == 0


class TestFacets:
    def test_counts_every_filter_value_over_the_whole_match(self):
        listing, convert = _listing(
            _header("1", "T1", device_type="thermostat", status=ConnectionStatus.OK),
            _header("2", "T2", device_type="thermostat", faulty=True, status="error"),
            _header("3", "Custom", device_type="chiller", status=ConnectionStatus.OK),
            _header("4", "Untyped"),
        )

        facets = listing.facets

        assert facets.type == {"thermostat": 2, "other": 2}
        assert facets.health == {DeviceHealth.HEALTHY: 3, DeviceHealth.FAULTY: 1}
        assert facets.connection_status == {
            ConnectionStatus.IDLE: 0,
            ConnectionStatus.OK: 2,
            ConnectionStatus.DEGRADED: 0,
            ConnectionStatus.ERROR: 1,
        }
        convert.assert_not_called()

    def test_an_empty_match_still_names_every_value(self):
        listing, _ = _listing()

        facets = listing.facets

        assert facets.type == {}
        assert set(facets.health) == set(DeviceHealth)
        assert set(facets.connection_status) == set(ConnectionStatus)
        assert sum(facets.health.values()) == 0
        assert sum(facets.connection_status.values()) == 0

    def test_an_unknown_status_value_counts_in_no_bucket(self):
        header = _header("1", "D")
        header.attributes[CONNECTION_STATUS_ATTR] = _Attribute("flaky")
        listing, _ = _listing(header)

        assert sum(listing.facets.connection_status.values()) == 0


class TestPage:
    def test_converts_the_slice_and_nothing_else(self):
        listing, convert = _listing(
            *(_header(str(i), f"Device {i}") for i in range(10))
        )

        page = listing.page(DeviceSortKey.NAME, PaginationParams(page=2, size=4))

        assert [d.id for d in page.items] == ["4", "5", "6", "7"]
        assert (page.total, page.page, page.size, page.total_pages) == (10, 2, 4, 3)
        assert convert.call_count == 4

    def test_a_page_past_the_end_is_empty_but_honest(self):
        listing, _ = _listing(*(_header(str(i), f"Device {i}") for i in range(10)))

        page = listing.page(DeviceSortKey.NAME, PaginationParams(page=5, size=4))

        assert page.items == []
        assert page.total == 10
        assert page.has_next is False

    def test_no_pagination_is_one_page_holding_everything(self):
        listing, _ = _listing(_header("a", "A"), _header("b", "B"), _header("c", "C"))

        page = listing.page()

        assert [d.id for d in page.items] == ["a", "b", "c"]
        assert (page.total, page.page, page.size, page.total_pages) == (3, 1, 3, 1)

    def test_no_pagination_over_nothing_is_a_valid_page(self):
        listing, _ = _listing()

        page = listing.page()

        assert page.items == []
        assert page.size == 1
        assert page.total_pages == 0

    def test_name_order_is_case_insensitive_with_id_as_tie_break(self):
        listing, _ = _listing(
            _header("b", "room 2"),
            _header("a", "room 2"),
            _header("c", "Room 1"),
            _header("d", "annex"),
        )

        page = listing.page(DeviceSortKey.NAME)

        assert [d.id for d in page.items] == ["d", "c", "a", "b"]

    def test_type_order_is_alphabetical_with_other_last_then_name(self):
        listing, _ = _listing(
            _header("1", "Pump 1", device_type="pump"),
            _header("2", "Custom", device_type="chiller"),
            _header("3", "b thermostat", device_type="thermostat"),
            _header("4", "Untyped"),
            _header("5", "A thermostat", device_type="thermostat"),
            _header("6", "AWHP", device_type="awhp"),
        )

        page = listing.page(DeviceSortKey.TYPE)

        assert [d.id for d in page.items] == ["6", "1", "5", "3", "2", "4"]

    def test_paging_leaves_the_iteration_order_alone(self):
        listing, _ = _listing(_header("b", "B"), _header("a", "A"))

        listing.page(DeviceSortKey.NAME)

        assert [d.id for d in listing] == ["b", "a"]


class TestIteration:
    def test_iterates_in_match_order_and_converts_once(self):
        listing, convert = _listing(_header("b", "B"), _header("a", "A"))

        first = [d.id for d in listing]
        second = [d.id for d in listing]

        assert first == second == ["b", "a"]
        assert convert.call_count == 2

    @pytest.mark.parametrize("size", [1, 5])
    def test_a_page_after_a_full_iteration_still_converts_its_slice(self, size):
        listing, convert = _listing(*(_header(str(i), f"D{i}") for i in range(5)))
        list(listing)

        listing.page(DeviceSortKey.NAME, PaginationParams(page=1, size=size))

        assert convert.call_count == 5 + size
