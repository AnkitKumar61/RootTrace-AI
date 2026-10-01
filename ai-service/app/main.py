from fastapi import FastAPI, Depends
from fastapi.responses import JSONResponse
from app.core.security import get_settings, require_internal

app = FastAPI(title='RootTrace analysis service', docs_url=None, redoc_url=None)

@app.get('/health')
def health():
    return {'status': 'ok', 'service': 'roottrace-analysis'}

@app.get('/health/ready', dependencies=[Depends(require_internal)])
def ready():
    settings = get_settings()
    configured = bool(settings.gemini_api_key and settings.qdrant_url)
    return JSONResponse({'status': 'ready' if configured else 'unavailable'}, status_code=200 if configured else 503)
