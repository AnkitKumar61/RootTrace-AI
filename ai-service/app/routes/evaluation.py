from fastapi import APIRouter, Depends

from app.core.security import require_internal
from app.services.evaluation_service import EvaluationRequest, EvaluationService
from app.services.pipeline import get_pipeline

router = APIRouter(prefix="/internal", dependencies=[Depends(require_internal)])


@router.post("/evaluate")
async def evaluate(request: EvaluationRequest):
    return await EvaluationService(get_pipeline()).run(request)
