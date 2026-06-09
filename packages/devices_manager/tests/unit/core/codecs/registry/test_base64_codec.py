import base64

import pytest

from devices_manager.core.codecs.factory import codec_entries
from devices_manager.core.codecs.registry.base64_codec import base64_codec
from devices_manager.core.codecs.registry.json_pointer_codec import (
    json_pointer_codec,
)

_JSON_PAYLOAD = base64.b64encode(b'{"temperature": 2.26, "humidity": 50}').decode()


def test_decode_returns_bytes() -> None:
    assert isinstance(base64_codec("").decode(_JSON_PAYLOAD), bytes)


def test_encode_roundtrip() -> None:
    codec = base64_codec("")
    assert codec.decode(codec.encode(b"hello world")) == b"hello world"


def test_chained_with_json_pointer() -> None:
    pipeline = base64_codec("") + json_pointer_codec("/temperature")  # type: ignore[operator]
    assert pipeline.decode(_JSON_PAYLOAD) == pytest.approx(2.26)


def test_factory_key_exists() -> None:
    assert "base64" in codec_entries


def test_factory_builds_codec() -> None:
    assert codec_entries["base64"].builder is base64_codec
