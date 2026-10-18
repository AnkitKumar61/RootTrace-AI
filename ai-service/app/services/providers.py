import asyncio
import math

from google import genai
from google.genai import types


class ProviderFailure(Exception):
    def __init__(self, status=503, retry_after=None):
        self.status = status
        self.retry_after = retry_after
        super().__init__("Provider request unavailable")


def gemini_client(settings):
    if not settings.gemini_api_key:
        raise ProviderFailure()
    return genai.Client(
        api_key=settings.gemini_api_key,
        http_options=types.HttpOptions(timeout=60000, retry_options=types.HttpRetryOptions(attempts=1)),
    )


def retry_delay(error):
    """Read only retry timing; never expose provider messages or request data."""
    delays = []
    response = getattr(error, "response", None)
    headers = getattr(response, "headers", {}) or {}
    candidates = [headers.get("retry-after")]
    payload = getattr(error, "details", {})
    if isinstance(payload, dict):
        payload = payload.get("error", payload)
        if isinstance(payload, dict):
            for detail in payload.get("details", []) or []:
                if isinstance(detail, dict):
                    candidates.append(detail.get("retryDelay"))
    for value in candidates:
        try:
            seconds = float(str(value).removesuffix("s"))
            if math.isfinite(seconds) and seconds > 0:
                delays.append(math.ceil(seconds))
        except (ValueError, TypeError):
            pass
    return max(delays, default=0)


async def retry_provider(operation):
    for attempt in range(3):
        try:
            return await operation()
        except ProviderFailure:
            raise
        except Exception as error:
            # Integrations may wrap the SDK error; inspect its cause without
            # copying messages (which may contain private request content).
            seen = set()
            while getattr(error, "code", None) is None and error.__cause__ is not None:
                if id(error) in seen:
                    break
                seen.add(id(error))
                error = error.__cause__
            code = getattr(error, "code", None)
            if code in [400, 401, 403, 404]:
                raise ProviderFailure(503) from None
            delay = max(30 * 2**attempt, retry_delay(error)) if code == 429 else 2**attempt
            # Long quota resets should surface as an honest retryable failure,
            # rather than keeping an ingestion request open indefinitely.
            if attempt == 2 or (code == 429 and delay > 60):
                raise ProviderFailure(429 if code == 429 else 503, delay if code == 429 else None) from None
            await asyncio.sleep(delay)
