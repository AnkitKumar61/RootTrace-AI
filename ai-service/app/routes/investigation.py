from fastapi import APIRouter, Depends

from app.core.security import require_internal
from app.schemas.investigation import RetrievalRequest
from app.services.pipeline import get_pipeline
from app.services.retrieval_service import RetrievalService

router = APIRouter(prefix="/internal", dependencies=[Depends(require_internal)])


@router.post("/retrieve")
async def retrieve(request: RetrievalRequest):
    evidence, duration = await RetrievalService(get_pipeline()).retrieve(request)
    return {"evidence": [item.model_dump() for item in evidence], "retrievalDurationMs": duration}
