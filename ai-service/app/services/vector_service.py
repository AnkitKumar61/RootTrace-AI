from qdrant_client import AsyncQdrantClient, models

from app.schemas.evidence import Evidence

from .providers import ProviderFailure


class VectorService:
    def __init__(self, settings, client=None):
        if not client and not settings.qdrant_url:
            raise ProviderFailure()
        self.settings = settings
        self.client = client or AsyncQdrantClient(
            url=settings.qdrant_url, api_key=settings.qdrant_api_key or None, timeout=30
        )
        self.collection = settings.qdrant_collection

    async def initialize(self):
        if not await self.client.collection_exists(self.collection):
            await self.client.create_collection(
                self.collection,
                vectors_config=models.VectorParams(
                    size=self.settings.embedding_dimensions, distance=models.Distance.COSINE
                ),
            )
        info = await self.client.get_collection(self.collection)
        if info.config.params.vectors.size != self.settings.embedding_dimensions:
            raise ProviderFailure()
        for field in ["projectId", "sourceId", "embeddingModel", "chunkType", "services", "severity"]:
            await self.client.create_payload_index(
                self.collection, field_name=field, field_schema=models.PayloadSchemaType.KEYWORD, wait=True
            )

    def project_filter(self, project_id):
        if not project_id or not project_id.strip():
            raise ValueError("A project filter is mandatory")
        return models.Filter(
            must=[models.FieldCondition(key="projectId", match=models.MatchValue(value=project_id))]
        )

    async def replace_source(self, project_id, source_id, chunks, vectors):
        if not source_id or len(chunks) != len(vectors):
            raise ValueError("Source indexing requires matching chunks and vectors")
        if any(c.projectId != project_id or c.sourceId != source_id for c in chunks):
            raise ValueError("Chunks must belong to the indexed project and source")
        if any(len(v) != self.settings.embedding_dimensions for v in vectors):
            raise ValueError("Embedding dimensions do not match the collection")
        query_filter = self.project_filter(project_id)
        query_filter.must.append(
            models.FieldCondition(key="sourceId", match=models.MatchValue(value=source_id))
        )
        await self.client.delete(
            self.collection, points_selector=models.FilterSelector(filter=query_filter), wait=True
        )
        for start in range(0, len(chunks), 64):
            points = [
                models.PointStruct(
                    id=chunk.chunkId,
                    vector=vector,
                    payload={
                        **chunk.model_dump(),
                        **chunk.metadata,
                        "embeddingModel": self.settings.embedding_model,
                    },
                )
                for chunk, vector in zip(chunks[start : start + 64], vectors[start : start + 64], strict=True)
            ]
            await self.client.upsert(self.collection, points=points, wait=True)
        return len(chunks)

    async def search(self, project_id, ready_source_ids, query_vector, *, top_k=None, filters=None):
        query_filter = self.project_filter(project_id)
        if not ready_source_ids:
            return []
        query_filter.must.extend(
            [
                models.FieldCondition(key="sourceId", match=models.MatchAny(any=ready_source_ids)),
                models.FieldCondition(
                    key="embeddingModel", match=models.MatchValue(value=self.settings.embedding_model)
                ),
            ]
        )
        for field, value in (filters or {}).items():
            key = {"service": "services", "sourceType": "chunkType", "severity": "severity"}.get(field)
            if key and value:
                query_filter.must.append(models.FieldCondition(key=key, match=models.MatchValue(value=value)))
        result = await self.client.query_points(
            self.collection,
            query=query_vector,
            query_filter=query_filter,
            limit=top_k or self.settings.retrieval_top_k,
            score_threshold=self.settings.retrieval_min_score,
            with_payload=True,
        )
        return [
            Evidence(**point.payload, evidenceId=str(point.id), score=point.score) for point in result.points
        ]

    async def delete_project(self, project_id):
        query_filter = self.project_filter(project_id)
        if await self.client.collection_exists(self.collection):
            await self.client.delete(
                self.collection, points_selector=models.FilterSelector(filter=query_filter), wait=True
            )

    async def close(self):
        await self.client.close()
