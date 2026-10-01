import secrets
from functools import lru_cache
from fastapi import Header, HTTPException
from .config import Settings

@lru_cache
def get_settings():
    return Settings()

def require_internal(x_service_secret: str = Header(default='')):
    if not secrets.compare_digest(x_service_secret, get_settings().ai_service_secret):
        raise HTTPException(status_code=401, detail='Unauthorized internal request')
