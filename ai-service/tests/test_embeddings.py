import asyncio
from types import SimpleNamespace

import pytest

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
    assert asyncio.run(embeddings.embed_batch(["log a", "log b"], titles=["a.log", "b.log"])) == [
        [0.6, 0.8],
        [0.6, 0.8],
    ]
    assert len(models.calls[0]["contents"]) == 2
    assert models.calls[0]["contents"][0].parts[0].text == "title: a.log | text: log a"
    asyncio.run(embeddings.embed_text("timeout", query=True))
    assert models.calls[1]["contents"][0].parts[0].text.startswith("task: search result | query:")


def test_malformed_response_never_returns_invalid_vectors():
    embeddings, _ = provider(True)
    with pytest.raises(ProviderFailure):
        asyncio.run(embeddings.embed_batch(["text"]))
