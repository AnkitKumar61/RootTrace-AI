from functools import lru_cache

from app.core.security import get_settings

from .embedding_service import EmbeddingProvider
from .vector_service import VectorService


class Pipeline:
    def __init__(self, settings):
        self.settings = settings
        self._embeddings = None
        self._vectors = None
        self.initialized = False

    @property
    def embeddings(self):
        if self._embeddings is None:
            self._embeddings = EmbeddingProvider(self.settings)
        return self._embeddings

    @property
    def vectors(self):
        if self._vectors is None:
            self._vectors = VectorService(self.settings)
        return self._vectors

    async def initialize(self):
        if not self.initialized:
            await self.vectors.initialize()
            self.initialized = True


@lru_cache
def get_pipeline():
    return Pipeline(get_settings())
