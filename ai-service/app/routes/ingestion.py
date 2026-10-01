import asyncio
import time
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile

from app.core.security import require_internal
from app.services.chunking_service import chunk_source
from app.services.pipeline import get_pipeline

router = APIRouter(prefix="/internal", dependencies=[Depends(require_internal)])
active_ingestions: dict[str, set] = {}
deleted_projects: set[str] = set()
Identifier = Annotated[str, Form(pattern=r"^[a-f0-9]{24}$")]


@router.post("/ingest")
async def ingest(
    file: UploadFile,
    projectId: Identifier,
    sourceId: Identifier,
    sourceType: Annotated[Literal["log", "document"], Form()],
    pipeline=Depends(get_pipeline),
):
    if projectId in deleted_projects:
        raise HTTPException(409, "Project is being deleted")
    task = asyncio.current_task()
    tasks = active_ingestions.setdefault(projectId, set())
    tasks.add(task)
    started = time.monotonic()
    try:
        maximum = pipeline.settings.max_file_size_mb * 1024 * 1024
        data = await file.read(maximum + 1)
        if len(data) > maximum:
            raise HTTPException(413, "Source exceeds the file size limit")
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise HTTPException(422, "Source must contain UTF-8 text") from None
        if not text.strip() or "\0" in text:
            raise HTTPException(422, "Source must contain non-empty text")
        name = Path((file.filename or "source.txt").replace("\\", "/")).name
        if Path(name).suffix.lower() not in [".log", ".txt", ".json", ".md"]:
            raise HTTPException(422, "Source format is not supported")
        chunks = chunk_source(
            text, project_id=projectId, source_id=sourceId, file_name=name, source_type=sourceType
        )
        if not chunks:
            raise HTTPException(422, "Source contains no indexable evidence")
        await pipeline.initialize()
        vectors = await pipeline.embeddings.embed_batch(
            [chunk.text for chunk in chunks], titles=[chunk.fileName for chunk in chunks]
        )
        if projectId in deleted_projects:
            raise HTTPException(409, "Project is being deleted")
        count = await pipeline.vectors.replace_source(projectId, sourceId, chunks, vectors)
        return {"chunkCount": count, "durationMs": round((time.monotonic() - started) * 1000)}
    finally:
        tasks.discard(task)
        if not tasks:
            active_ingestions.pop(projectId, None)
        await file.close()


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str, pipeline=Depends(get_pipeline)):
    # This local cancellation barrier complements the worker's MongoDB status guard.
    # Run a single service process; no additional lock infrastructure is required.
    deleted_projects.add(project_id)
    tasks = list(active_ingestions.get(project_id, set()))
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
    await pipeline.vectors.delete_project(project_id)
    return {"deleted": True}
