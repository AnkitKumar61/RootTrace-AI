from time import perf_counter


class RetrievalService:
    def __init__(self, pipeline):
        self.pipeline = pipeline

    async def retrieve(self, request):
        started = perf_counter()
        if not request.readySourceIds:
            return [], 0
        await self.pipeline.initialize()
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
        vector = await self.pipeline.embeddings.embed_text(query, query=True)
        # Service names improve the query, but are not mandatory filters: related
        # upstream/downstream logs and documentation can explain the failure.
        evidence = await self.pipeline.vectors.search(
            request.projectId,
            request.readySourceIds,
            vector,
            top_k=request.topK,
            filters=request.filters,
        )
        return evidence, round((perf_counter() - started) * 1000)
