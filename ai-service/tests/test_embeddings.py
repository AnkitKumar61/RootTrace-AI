import asyncio
from types import SimpleNamespace

import pytest
from langchain_core.embeddings import Embeddings

from app.services.embedding_service import EmbeddingProvider
from app.services.providers import ProviderFailure


class FakeModels:
    def __init__(self, broken=False):
        self.broken = broken
        self.calls = []

    async def embed_content(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            embeddings=[] if self.broken else [SimpleNamespace(values=[3.0, 4.0]) for _ in kwargs["contents"]]
        )


def provider(broken=False):
    settings = SimpleNamespace(
        embedding_provider="gemini", embedding_model="configured-model", embedding_dimensions=2
    )
    models = FakeModels(broken)
    return EmbeddingProvider(settings, SimpleNamespace(aio=SimpleNamespace(models=models))), models


def test_individual_chunk_boundaries_query_format_and_normalization():
    embeddings, models = provider()
    assert isinstance(embeddings, Embeddings)
    assert asyncio.run(embeddings.aembed_documents(["log a", "log b"], titles=["a.log", "b.log"])) == [
        [0.6, 0.8],
        [0.6, 0.8],
    ]
    assert len(models.calls[0]["contents"]) == 2
    assert models.calls[0]["contents"][0].parts[0].text == "title: a.log | text: log a"
    asyncio.run(embeddings.aembed_query("timeout"))
    assert models.calls[1]["contents"][0].parts[0].text.startswith("task: search result | query:")
    assert models.calls[0]["config"].task_type is None  # Preserve the existing embedding space.


def test_langchain_batching_preserves_order_titles_and_bounded_requests():
    embeddings, models = provider()
    texts = [f"event {index}" for index in range(19)]
    assert len(embeddings.embed_documents(texts, titles=["service.log"] * 19)) == 19
    assert [len(call["contents"]) for call in models.calls] == [8, 8, 3]
    assert [content.parts[0].text for call in models.calls for content in call["contents"]] == [
        f"title: service.log | text: {text}" for text in texts
    ]
    assert embeddings.embed_query("timeout") == [0.6, 0.8]


@pytest.mark.parametrize(
    "vectors", [[[1, 0]], [[0, 0], [1, 0]], [[float("nan"), 1], [1, 0]], [[1, 0, 0], [1, 0]]]
)
def test_invalid_cardinality_values_and_dimensions_are_rejected(vectors):
    from unittest.mock import AsyncMock

    embeddings, models = provider()
    models.embed_content = AsyncMock(
        return_value=SimpleNamespace(embeddings=[SimpleNamespace(values=vector) for vector in vectors])
    )
    with pytest.raises(ProviderFailure) as error:
        asyncio.run(embeddings.aembed_documents(["one", "two"]))
    assert error.value.status == 502


def test_malformed_response_never_returns_invalid_vectors():
    embeddings, _ = provider(True)
    with pytest.raises(ProviderFailure):
        asyncio.run(embeddings.embed_batch(["text"]))
