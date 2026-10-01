import asyncio

from google import genai
from google.genai import types


class ProviderFailure(Exception):
    def __init__(self, status=503):
        self.status = status
        super().__init__("Provider request unavailable")


def gemini_client(settings):
    if not settings.gemini_api_key:
        raise ProviderFailure()
    return genai.Client(
        api_key=settings.gemini_api_key,
        http_options=types.HttpOptions(timeout=60000, retry_options=types.HttpRetryOptions(attempts=1)),
    )


async def retry_provider(operation):
    for attempt in range(3):
        try:
            return await operation()
        except Exception as error:
            code = getattr(error, "code", None)
            if code in [400, 401, 403, 404]:
                raise ProviderFailure(503) from None
            if attempt == 2:
                raise ProviderFailure(429 if code == 429 else 503) from None
            await asyncio.sleep(2**attempt)
