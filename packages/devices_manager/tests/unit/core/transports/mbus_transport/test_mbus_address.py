import pytest

from devices_manager.core.transports.mbus_transport.mbus_address import MBusAddress

VALID_CASES: list[tuple[str, dict, MBusAddress]] = [
    (
        "1/0",
        {"primary_address": 1, "record_index": 0},
        MBusAddress(primary_address=1, record_index=0),
    ),
    (
        " 5/2 ",
        {"primary_address": 5, "record_index": 2},
        MBusAddress(primary_address=5, record_index=2),
    ),
    (
        "0/13",
        {"primary_address": 0, "record_index": 13},
        MBusAddress(primary_address=0, record_index=13),
    ),
]


@pytest.mark.parametrize(("address_str", "address_dict", "expected"), VALID_CASES)
def test_from_str_and_from_dict(
    address_str: str, address_dict: dict, expected: MBusAddress
) -> None:
    assert MBusAddress.from_str(address_str) == expected
    assert MBusAddress.from_dict(address_dict) == expected


def test_from_raw_dispatches_str_and_dict() -> None:
    assert MBusAddress.from_raw("3/4") == MBusAddress(primary_address=3, record_index=4)
    assert MBusAddress.from_raw({"primary_address": 3, "record_index": 4}) == (
        MBusAddress(primary_address=3, record_index=4)
    )


def test_id_is_deterministic_from_parts() -> None:
    assert MBusAddress(primary_address=7, record_index=1).id == "mbus@7/1"


@pytest.mark.parametrize("bad", ["1", "1/2/3", "a/0", "1/b", ""])
def test_from_str_rejects_bad_format(bad: str) -> None:
    with pytest.raises(ValueError, match="Invalid M-Bus address"):
        MBusAddress.from_str(bad)


@pytest.mark.parametrize(
    ("address_str", "address_dict"),
    [
        ("-1/0", {"primary_address": -1, "record_index": 0}),  # negative primary
        ("1/-1", {"primary_address": 1, "record_index": -1}),  # negative record
        ("251/0", {"primary_address": 251, "record_index": 0}),  # primary > 250
    ],
)
def test_str_and_dict_reject_out_of_range_consistently(
    address_str: str, address_dict: dict
) -> None:
    # Range/sign constraints live on the model, so both entry points reject the
    # same values (ValidationError is a ValueError subclass).
    with pytest.raises(ValueError):  # noqa: PT011
        MBusAddress.from_str(address_str)
    with pytest.raises(ValueError):  # noqa: PT011
        MBusAddress.from_dict(address_dict)


def test_from_raw_rejects_invalid_type() -> None:
    with pytest.raises(ValueError, match="Invalid raw address type"):
        MBusAddress.from_raw(42)  # ty: ignore[invalid-argument-type]
