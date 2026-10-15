import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.services.providers import ProviderFailure, retry_delay, retry_provider


class Failure(Exception):
    def __init__(self, code):
        self.code = code


def test_quota_retries_are_bounded_and_permanent_errors_are_not_retried():
    async def run():
        with patch("app.services.providers.asyncio.sleep", new=AsyncMock()) as sleep:
            operation = AsyncMock(side_effect=Failure(429))
            with pytest.raises(ProviderFailure) as error:
                await retry_provider(operation)
            assert error.value.status == 429 and operation.await_count == 3
            assert [call.args[0] for call in sleep.await_args_list] == [30, 60]
            operation = AsyncMock(side_effect=Failure(401))
            with pytest.raises(ProviderFailure) as error:
                await retry_provider(operation)
            assert error.value.status == 503 and operation.await_count == 1

    asyncio.run(run())


def test_retry_hint_is_honored_and_long_resets_do_not_hold_requests_open():
    async def run():
        error = Failure(429)
        error.details = {"error": {"details": [{"retryDelay": "45.2s"}]}}
        with patch("app.services.providers.asyncio.sleep", new=AsyncMock()) as sleep:
            operation = AsyncMock(side_effect=[error, "recovered"])
            assert await retry_provider(operation) == "recovered"
            sleep.assert_awaited_once_with(46)
        error.details = {"error": {"details": [{"retryDelay": "3600s"}]}}
        with patch("app.services.providers.asyncio.sleep", new=AsyncMock()) as sleep:
            operation = AsyncMock(side_effect=error)
            with pytest.raises(ProviderFailure) as failure:
                await retry_provider(operation)
            assert failure.value.retry_after == 3600
            assert failure.value.status == 429 and operation.await_count == 1
            sleep.assert_not_awaited()

    asyncio.run(run())


def test_invalid_retry_metadata_is_ignored_and_headers_are_supported():
    from types import SimpleNamespace

    error = Failure(429)
    error.response = SimpleNamespace(headers={"retry-after": "20"})
    error.details = {"error": {"details": [None, {"retryDelay": "nan"}, {"retryDelay": "secret-data"}]}}
    assert retry_delay(error) == 20


def test_unavailable_provider_keeps_short_bounded_retries():
    async def run():
        with patch("app.services.providers.asyncio.sleep", new=AsyncMock()) as sleep:
            operation = AsyncMock(side_effect=Failure(503))
            with pytest.raises(ProviderFailure) as failure:
                await retry_provider(operation)
            assert failure.value.status == 503 and operation.await_count == 3
            assert [call.args[0] for call in sleep.await_args_list] == [1, 2]

    asyncio.run(run())
