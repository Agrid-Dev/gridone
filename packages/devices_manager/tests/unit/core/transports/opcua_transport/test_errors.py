import inspect

import pytest
from asyncua import ua
from asyncua.client.client import Client

from devices_manager.core.transports.opcua_transport.errors import (
    NO_MATCHING_ENDPOINT_MESSAGE,
    SERVER_CERTIFICATE_MISMATCH_MESSAGE,
    is_secure_channel_rejection,
)


def test_typed_status_code_rejection_is_terminal_regardless_of_security() -> None:
    exc = ua.uaerrors.BadCertificateUntrusted()
    assert is_secure_channel_rejection(exc, secure_channel_enabled=False)
    assert is_secure_channel_rejection(exc, secure_channel_enabled=True)


_FALLBACK_MESSAGES = [NO_MATCHING_ENDPOINT_MESSAGE, SERVER_CERTIFICATE_MISMATCH_MESSAGE]


@pytest.mark.parametrize("message", _FALLBACK_MESSAGES)
def test_message_fallback_is_transient_on_an_unsecured_transport(message: str) -> None:
    # asyncua re-runs endpoint lookup on every connect regardless of security,
    # so on an unsecured transport this is a transient hiccup, not a rejection.
    exc = ua.UaError(message)
    assert not is_secure_channel_rejection(exc, secure_channel_enabled=False)


@pytest.mark.parametrize("message", _FALLBACK_MESSAGES)
def test_message_fallback_is_terminal_on_a_secured_transport(message: str) -> None:
    exc = ua.UaError(message)
    assert is_secure_channel_rejection(exc, secure_channel_enabled=True)


def test_no_matching_endpoints_wording_is_pinned_to_asyncua_source() -> None:
    # Fails loudly if asyncua ever renames this message, instead of the
    # fallback silently stopping matching and retrying forever.
    source = inspect.getsource(Client.find_endpoint)
    assert NO_MATCHING_ENDPOINT_MESSAGE in source


def test_certificate_mismatch_wording_is_pinned_to_asyncua_source() -> None:
    source = inspect.getsource(Client.create_session)
    assert SERVER_CERTIFICATE_MISMATCH_MESSAGE in source
