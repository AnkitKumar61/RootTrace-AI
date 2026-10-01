import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.schemas.investigation import RetrievalRequest
from app.services.retrieval_service import RetrievalService


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
        embeddings=SimpleNamespace(embed_text=AsyncMock(return_value=[1, 0])),
        vectors=SimpleNamespace(search=AsyncMock(return_value=[])),
    )
    asyncio.run(RetrievalService(pipeline).retrieve(request(topK=3, filters={"severity": "ERROR"})))
    query = pipeline.embeddings.embed_text.call_args.args[0]
    assert "Payment timeout" in query and "payment-service" in query
    pipeline.vectors.search.assert_awaited_once_with(
        "a" * 24, ["b" * 24], [1, 0], top_k=3, filters={"severity": "ERROR"}
    )
