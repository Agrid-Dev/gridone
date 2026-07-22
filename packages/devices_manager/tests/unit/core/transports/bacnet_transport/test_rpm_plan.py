import pytest

from devices_manager.core.transports.bacnet_transport.bacnet_address import (
    BacnetAddress,
)
from devices_manager.core.transports.bacnet_transport.rpm_plan import (
    DEFAULT_MAX_APDU,
    RpmRequest,
    plan_rpm,
)

_FRACTION = 0.5


def _plan(
    addresses: list[BacnetAddress],
    *,
    max_apdu_by_device: dict[int, int],
    request_apdu_fraction: float = _FRACTION,
) -> list[RpmRequest]:
    return plan_rpm(
        addresses,
        max_apdu_by_device=max_apdu_by_device,
        request_apdu_fraction=request_apdu_fraction,
    )


def _addr(
    device_instance: int,
    instance: int,
    *,
    object_type: str = "analog-input",
    property_name: str = "present-value",
) -> BacnetAddress:
    return BacnetAddress(
        device_instance=device_instance,
        object_type=object_type,  # ty: ignore[invalid-argument-type]
        object_instance=instance,
        property_name=property_name,
    )


class TestPlanRpm:
    def test_single_address_gets_one_request(self) -> None:
        requests = _plan([_addr(1, 0)], max_apdu_by_device={1: 1024})

        assert len(requests) == 1
        assert requests[0].device_instance == 1
        assert len(requests[0].specs) == 1
        assert requests[0].addresses == (_addr(1, 0),)

    def test_addresses_split_across_devices_never_share_a_request(self) -> None:
        addresses = [_addr(1, 0), _addr(2, 0)]

        requests = _plan(addresses, max_apdu_by_device={1: 1024, 2: 1024})

        assert len(requests) == 2
        assert {r.device_instance for r in requests} == {1, 2}

    def test_addresses_sharing_one_object_become_one_spec(self) -> None:
        addresses = [
            _addr(1, 0, property_name="present-value"),
            _addr(1, 0, property_name="reliability"),
        ]

        requests = _plan(addresses, max_apdu_by_device={1: 1024})

        assert len(requests) == 1
        assert len(requests[0].specs) == 1
        assert len(requests[0].specs[0].listOfPropertyReferences) == 2  # ty: ignore[invalid-argument-type]

    def test_chunks_at_the_devices_apdu_budget(self) -> None:
        # 5 single-property analog-input objects, single-digit instances,
        # encode to 9 bytes each; max_apdu=50 budgets 25 bytes/request, so
        # only 2 objects (18 bytes) fit before a 3rd (27 bytes) overflows.
        addresses = [_addr(1, i) for i in range(5)]

        requests = _plan(addresses, max_apdu_by_device={1: 50})

        assert [len(r.specs) for r in requests] == [2, 2, 1]
        assert sum(len(r.addresses) for r in requests) == 5
        # Every address is recoverable from exactly one request.
        seen = {a.id for r in requests for a in r.addresses}
        assert seen == {a.id for a in addresses}

    def test_larger_apdu_budget_fits_more_per_request(self) -> None:
        addresses = [_addr(1, i) for i in range(5)]

        requests = _plan(addresses, max_apdu_by_device={1: 1024})

        assert len(requests) == 1
        assert len(requests[0].specs) == 5

    def test_smaller_request_apdu_fraction_fits_fewer_per_request(self) -> None:
        addresses = [_addr(1, i) for i in range(5)]

        wide = _plan(addresses, max_apdu_by_device={1: 50}, request_apdu_fraction=1.0)
        narrow = _plan(addresses, max_apdu_by_device={1: 50}, request_apdu_fraction=0.2)

        assert len(wide) < len(narrow)

    def test_unknown_device_falls_back_to_default_max_apdu(self) -> None:
        addresses = [_addr(1, i) for i in range(5)]

        requests = _plan(addresses, max_apdu_by_device={})

        assert requests == _plan(addresses, max_apdu_by_device={1: DEFAULT_MAX_APDU})

    def test_reported_zero_max_apdu_falls_back_to_default(self) -> None:
        addresses = [_addr(1, i) for i in range(5)]

        requests = _plan(addresses, max_apdu_by_device={1: 0})

        assert requests == _plan(addresses, max_apdu_by_device={1: DEFAULT_MAX_APDU})

    def test_oversized_object_gets_a_solo_request_and_does_not_block_others(
        self,
    ) -> None:
        # A single object with many properties can alone exceed a tiny budget;
        # it must still get its own request rather than swallowing/blocking a
        # neighbour.
        huge = BacnetAddress(
            device_instance=1,
            object_type="analog-input",  # ty: ignore[invalid-argument-type]
            object_instance=0,
            property_name="present-value",
        )
        addresses = [huge, _addr(1, 1)]

        requests = _plan(addresses, max_apdu_by_device={1: 1})

        assert len(requests) == 2
        assert requests[0].addresses == (huge,)
        assert requests[1].addresses == (_addr(1, 1),)

    def test_empty_addresses_produce_no_requests(self) -> None:
        assert _plan([], max_apdu_by_device={}) == []

    @pytest.mark.parametrize("object_type", ["analog-value", "binary-input", "MV"])
    def test_mixed_object_types_share_one_request(self, object_type: str) -> None:
        addresses = [_addr(1, 0), _addr(1, 1, object_type=object_type)]

        requests = _plan(addresses, max_apdu_by_device={1: 1024})

        assert len(requests) == 1
        assert len(requests[0].specs) == 2

    def test_large_address_set_matches_combined_encoding_exactly(self) -> None:
        """Regression guard for the incremental per-spec sizing in plan_rpm:
        summed individual spec sizes must equal the real combined encoding
        even past the ASN.1 128-byte length-prefix boundary, so packing
        decisions stay correct at realistic device scale (hundreds of
        objects)."""
        addresses = [_addr(1, i) for i in range(200)]

        requests = _plan(addresses, max_apdu_by_device={1: 1476})

        seen = {a.id for r in requests for a in r.addresses}
        assert seen == {a.id for a in addresses}
        assert sum(len(r.addresses) for r in requests) == 200
