import asyncio
from types import SimpleNamespace

import pytest
from qdrant_client import AsyncQdrantClient

from app.services.chunking_service import chunk_source
from app.services.vector_service import VectorService


def test_project_filter_isolation_idempotent_reindex_and_cleanup():
    async def run():
        settings = SimpleNamespace(
            qdrant_collection="test",
            embedding_dimensions=2,
            embedding_model="fixture",
            retrieval_top_k=8,
            retrieval_min_score=0,
        )
        store = VectorService(settings, AsyncQdrantClient(":memory:"))
        await store.initialize()
        a = chunk_source(
            "ERROR timeout", project_id="a", source_id="s-a", file_name="a.log", source_type="log"
        )
        b = chunk_source(
            "ERROR identical timeout", project_id="b", source_id="s-b", file_name="b.log", source_type="log"
        )
        await store.replace_source("a", "s-a", a, [[1.0, 0.0]])
        await store.replace_source("b", "s-b", b, [[1.0, 0.0]])
        await store.replace_source("a", "s-a", a, [[1.0, 0.0]])
        assert (await store.client.count("test", exact=True)).count == 2
        assert [item.projectId for item in await store.search("a", ["s-a", "s-b"], [1.0, 0.0])] == ["a"]
        assert await store.search("a", [], [1.0, 0.0]) == []
        with pytest.raises(ValueError):
            await store.search("", ["s-a"], [1.0, 0.0])
        await store.delete_project("a")
        await store.delete_project("a")
        assert (await store.client.count("test", exact=True)).count == 1
        await store.close()

    asyncio.run(run())


def test_project_constraint_is_sent_in_query_not_filtered_after():
    class Client:
        async def query_points(self, *args, **kwargs):
            assert kwargs["query_filter"].must[0].key == "projectId"
            assert kwargs["query_filter"].must[0].match.value == "a"
            return SimpleNamespace(points=[])

    settings = SimpleNamespace(
        qdrant_collection="test", embedding_model="fixture", retrieval_top_k=8, retrieval_min_score=0
    )
    store = VectorService(settings, Client())
    assert asyncio.run(store.search("a", ["s-a"], [1.0, 0.0])) == []
