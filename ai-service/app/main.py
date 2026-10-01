from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.security import get_settings, require_internal
from app.routes.ingestion import router as ingestion_router
from app.routes.investigation import router as investigation_router
from app.services.pipeline import get_pipeline
from app.services.providers import ProviderFailure

app = FastAPI(title="RootTrace analysis service", docs_url=None, redoc_url=None)
app.include_router(ingestion_router)
app.include_router(investigation_router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "roottrace-analysis"}


@app.get("/health/ready", dependencies=[Depends(require_internal)])
async def ready():
    settings = get_settings()
    configured = bool(settings.gemini_api_key and settings.qdrant_url)
    if configured:
        try:
            await get_pipeline().initialize()
        except Exception:
            configured = False
    return JSONResponse(
        {"status": "ready" if configured else "unavailable"}, status_code=200 if configured else 503
    )


@app.exception_handler(ProviderFailure)
async def provider_failure(_request: Request, error: ProviderFailure):
    return JSONResponse(
        {
            "detail": "Provider quota reached. Retry later."
            if error.status == 429
            else "Provider request unavailable."
        },
        status_code=error.status,
    )


@app.exception_handler(RequestValidationError)
async def invalid_request(_request: Request, _error: RequestValidationError):
    return JSONResponse({"detail": "Invalid internal request."}, status_code=422)


@app.exception_handler(Exception)
async def safe_failure(_request: Request, _error: Exception):
    return JSONResponse({"detail": "The analysis operation could not be completed."}, status_code=503)
