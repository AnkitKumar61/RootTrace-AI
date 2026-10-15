import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from qdrant_client import AsyncQdrantClient
from qdrant_client.http.exceptions import ResponseHandlingException

from app.services.chunking_service import chunk_source
from app.services.providers import ProviderFailure
from app.services.vector_service import VectorService, retry_vector_write


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


def test_timed_out_writes_retry_same_points_in_small_batches_without_duplicates():
    async def run():
        client = AsyncQdrantClient(":memory:")
        settings = SimpleNamespace(
            qdrant_collection="retry", embedding_dimensions=2, embedding_model="fixture"
        )
        store = VectorService(settings, client)
        await store.initialize()
        chunks = chunk_source(
            "\n".join(f"ERROR fictional-service traceId=fictional-{index} timeout" for index in range(33)),
            project_id="a",
            source_id="s-a",
            file_name="fictional.log",
            source_type="log",
        )
        upsert = client.upsert
        batches = []

        async def timeout_after_first_write(*args, **kwargs):
            batches.append([point.id for point in kwargs["points"]])
            result = await upsert(*args, **kwargs)
            if len(batches) == 1:
                raise ResponseHandlingException(TimeoutError("private storage response"))
            return result

        with patch.object(client, "upsert", side_effect=timeout_after_first_write):
            with patch("app.services.vector_service.asyncio.sleep", new=AsyncMock()) as sleep:
                assert await store.replace_source("a", "s-a", chunks, [[1.0, 0.0]] * len(chunks)) == 33
                sleep.assert_awaited_once_with(1)
        assert [len(batch) for batch in batches] == [16, 16, 16, 1]
        assert batches[0] == batches[1]
        assert (await client.count("retry", exact=True)).count == 33
        await store.close()

    asyncio.run(run())


def test_vector_write_exhaustion_is_bounded_and_never_exposes_raw_errors():
    async def run():
        operation = AsyncMock(side_effect=ResponseHandlingException(TimeoutError("private storage response")))
        with patch("app.services.vector_service.asyncio.sleep", new=AsyncMock()):
            with pytest.raises(ProviderFailure) as error:
                await retry_vector_write(operation)
        assert operation.await_count == 3
        assert error.value.status == 503
        assert "private storage response" not in str(error.value)

    asyncio.run(run())
