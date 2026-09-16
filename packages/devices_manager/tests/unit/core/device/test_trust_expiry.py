import asyncio
from unittest.mock import Mock

import pytest

from devices_manager.core.device.trust_expiry import TrustExpiry

from ..fixtures.fake_time import fake_time


def test_expiry_is_enforced_without_waiting_for_a_timer():
    clock = Mock(return_value=0.0)
    expired = Mock()
    expiry = TrustExpiry(60, expired, now=clock)
    expiry.expire_if_due()
    expired.assert_not_called()
    expiry.record_observation()
    clock.return_value = 59.0
    expiry.expire_if_due()
    expired.assert_not_called()
    clock.return_value = 60.0
    expiry.expire_if_due()
    expiry.expire_if_due()
    expired.assert_called_once_with()


@fake_time
@pytest.mark.asyncio
async def test_watch_does_not_extend_an_existing_deadline():
    expired = Mock()
    expiry = TrustExpiry(60, expired, now=asyncio.get_running_loop().time)
    expiry.watch()
    await asyncio.sleep(30)
    expiry.watch()
    await asyncio.sleep(31)
    expired.assert_called_once_with()
    expiry.close()


@fake_time
@pytest.mark.asyncio
async def test_each_observation_starts_a_new_bounded_window():
    expired = Mock()
    expiry = TrustExpiry(60, expired, now=asyncio.get_running_loop().time)
    expiry.watch()
    await asyncio.sleep(30)
    expiry.record_observation()
    await asyncio.sleep(31)
    expired.assert_not_called()
    await asyncio.sleep(30)
    expired.assert_called_once_with()
    expiry.record_observation()
    await asyncio.sleep(61)
    assert expired.call_count == 2
    expiry.close()


@fake_time
@pytest.mark.asyncio
async def test_close_cancels_expiry_until_restarted():
    expired = Mock()
    expiry = TrustExpiry(60, expired, now=asyncio.get_running_loop().time)
    expiry.close()
    expiry.watch()
    expiry.close()
    expiry.close()
    await asyncio.sleep(61)
    expiry.expire_if_due()
    expired.assert_not_called()
    expiry.watch()
    await asyncio.sleep(61)
    expired.assert_called_once_with()
    expiry.close()


@fake_time
@pytest.mark.asyncio
async def test_early_timer_retries_until_the_deadline():
    clock = Mock(return_value=0.0)
    expired = Mock()
    expiry = TrustExpiry(60, expired, now=clock)
    expiry.watch()
    clock.return_value = 59.0
    await asyncio.sleep(60)
    expired.assert_not_called()
    clock.return_value = 60.0
    await asyncio.sleep(1)
    expired.assert_called_once_with()
    expiry.close()
