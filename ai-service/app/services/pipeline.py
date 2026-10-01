from functools import lru_cache

from app.core.security import get_settings

from .embedding_service import EmbeddingProvider
from .vector_service import VectorService


class Pipeline:
    def __init__(self, settings):
        self.settings = settings
        self.embeddings = EmbeddingProvider(settings)
        self.vectors = VectorService(settings)
        self.initialized = False

    async def initialize(self):
        if not self.initialized:
            await self.vectors.initialize()
            self.initialized = True


@lru_cache
def get_pipeline():
    return Pipeline(get_settings())
