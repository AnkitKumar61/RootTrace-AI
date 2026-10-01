import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.services.providers import ProviderFailure, retry_provider


class Failure(Exception):
    def __init__(self, code):
        self.code = code


def test_quota_retries_are_bounded_and_permanent_errors_are_not_retried():
    async def run():
        with patch("app.services.providers.asyncio.sleep", new=AsyncMock()):
            operation = AsyncMock(side_effect=Failure(429))
            with pytest.raises(ProviderFailure) as error:
                await retry_provider(operation)
            assert error.value.status == 429 and operation.await_count == 3
            operation = AsyncMock(side_effect=Failure(401))
            with pytest.raises(ProviderFailure) as error:
                await retry_provider(operation)
            assert error.value.status == 503 and operation.await_count == 1

    asyncio.run(run())
