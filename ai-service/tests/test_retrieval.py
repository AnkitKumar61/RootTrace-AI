import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.schemas.investigation import RetrievalRequest
from app.services.retrieval_service import ProjectEvidenceRetriever, RetrievalService


def request(**kwargs):
    return RetrievalRequest(
        projectId="a" * 24,
        readySourceIds=["b" * 24],
        incident={
            "title": "Payment timeout",
            "description": "Checkout fails with timeout",
            "affectedService": "payment-service",
        },
        **kwargs,
    )


def test_empty_ready_sources_skip_all_provider_calls():
    pipeline = SimpleNamespace(initialize=AsyncMock())
    data = request()
    data.readySourceIds = []
    assert asyncio.run(RetrievalService(pipeline).retrieve(data)) == ([], 0)
    pipeline.initialize.assert_not_called()


def test_retrieval_query_and_constraints():
    pipeline = SimpleNamespace(
        initialize=AsyncMock(),
        embeddings=SimpleNamespace(aembed_query=AsyncMock(return_value=[1, 0])),
        vectors=SimpleNamespace(search=AsyncMock(return_value=[])),
    )
    asyncio.run(RetrievalService(pipeline).retrieve(request(topK=3, filters={"severity": "ERROR"})))
    query = pipeline.embeddings.aembed_query.call_args.args[0]
    assert "Payment timeout" in query and "payment-service" in query
    pipeline.vectors.search.assert_awaited_once_with(
        "a" * 24, ["b" * 24], [1, 0], top_k=3, filters={"severity": "ERROR"}
    )


def test_langchain_retrieval_preserves_citations_and_cross_project_isolation():
    from qdrant_client import AsyncQdrantClient

    from app.services.chunking_service import chunk_source
    from app.services.vector_service import VectorService

    async def run():
        settings = SimpleNamespace(
            qdrant_collection="retriever",
            embedding_dimensions=2,
            embedding_model="fixture",
            retrieval_top_k=8,
            retrieval_min_score=0,
        )
        store = VectorService(settings, AsyncQdrantClient(":memory:"))
        await store.initialize()
        for project, source in [("a" * 24, "b" * 24), ("c" * 24, "d" * 24)]:
            chunks = chunk_source(
                "ERROR payment-service timeout",
                project_id=project,
                source_id=source,
                file_name="payment.log",
                source_type="log",
            )
            await store.replace_source(project, source, chunks, [[1.0, 0.0]])
        pipeline = SimpleNamespace(
            initialize=AsyncMock(),
            embeddings=SimpleNamespace(aembed_query=AsyncMock(return_value=[1, 0])),
            vectors=store,
        )
        first, second = request(), request()
        first.readySourceIds = second.readySourceIds = ["b" * 24, "d" * 24]
        second.projectId = "c" * 24
        results = await asyncio.gather(
            RetrievalService(pipeline).retrieve(first), RetrievalService(pipeline).retrieve(second)
        )
        for (items, _), project in zip(results, [first.projectId, second.projectId]):
            assert len(items) == 1 and items[0].projectId == project
            assert items[0].lineStart == items[0].lineEnd == 1
            assert items[0].fileName == "payment.log" and items[0].evidenceId == items[0].chunkId
        retriever = ProjectEvidenceRetriever(pipeline=pipeline, request=first)
        documents = await retriever.ainvoke("timeout")
        assert documents[0].id == results[0][0][0].evidenceId
        assert documents[0].page_content == results[0][0][0].text
        await store.close()

    asyncio.run(run())
