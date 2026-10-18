import asyncio
from time import perf_counter
from typing import Any

from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from langsmith import tracing_context

from app.schemas.evidence import Evidence
from app.schemas.investigation import RetrievalRequest


class ProjectEvidenceRetriever(BaseRetriever):
    """Request-scoped retriever over the existing filtered Qdrant index."""

    pipeline: Any
    request: RetrievalRequest

    def _get_relevant_documents(self, query, *, run_manager):
        return asyncio.run(self._fetch(query))

    async def _aget_relevant_documents(self, query, *, run_manager):
        return await self._fetch(query)

    async def _fetch(self, query):
        if not self.request.readySourceIds:
            return []
        await self.pipeline.initialize()
        vector = await self.pipeline.embeddings.aembed_query(query)
        # Keep project, READY-source, and model filtering in the storage layer.
        evidence = await self.pipeline.vectors.search(
            self.request.projectId,
            self.request.readySourceIds,
            vector,
            top_k=self.request.topK,
            filters=self.request.filters,
        )
        return [
            Document(
                id=item.evidenceId,
                page_content=item.text,
                metadata=item.model_dump(exclude={"text"}),
            )
            for item in evidence
        ]


class RetrievalService:
    def __init__(self, pipeline):
        self.pipeline = pipeline

    async def retrieve(self, request):
        started = perf_counter()
        if not request.readySourceIds:
            return [], 0
        incident = request.incident
        query = "\n".join(
            filter(
                None,
                [
                    incident.title,
                    incident.description,
                    incident.affectedService,
                    f"Incident window: {incident.startTime} to {incident.endTime}"
                    if incident.startTime
                    else "",
                ],
            )
        )
        # Service names improve the query, but are not mandatory filters: related
        # upstream/downstream logs and documentation can explain the failure.
        retriever = ProjectEvidenceRetriever(pipeline=self.pipeline, request=request.model_copy(deep=True))
        with tracing_context(enabled=False):
            documents = await retriever.ainvoke(query)
        evidence = [Evidence(**item.metadata, text=item.page_content) for item in documents]
        return evidence, round((perf_counter() - started) * 1000)
