import math

from google.genai import types

from .providers import ProviderFailure, gemini_client, retry_provider


class EmbeddingProvider:
    def __init__(self, settings, client=None):
        if settings.embedding_provider != "gemini":
            raise ProviderFailure()
        self.settings = settings
        self.client = client or gemini_client(settings)

    def document_text(self, text, title="none"):
        return f"title: {title} | text: {text}"

    def query_text(self, text):
        return f"task: search result | query: {text}"

    async def embed_text(self, text, *, query=False, title="none"):
        return (await self.embed_batch([text], query=query, titles=[title]))[0]

    async def embed_batch(self, texts, *, query=False, titles=None):
        if not texts:
            return []
        titles = titles or ["none"] * len(texts)
        if len(titles) != len(texts):
            raise ValueError("Each document must have a title")
        vectors = []
        # Explicit Content boundaries prevent distinct chunks from being aggregated.
        for start in range(0, len(texts), 8):
            contents = [
                types.Content(
                    parts=[
                        types.Part(
                            text=self.query_text(text) if query else self.document_text(text, titles[index])
                        )
                    ]
                )
                for index, text in enumerate(texts[start : start + 8], start)
            ]
            response = await retry_provider(
                lambda: self.client.aio.models.embed_content(
                    model=self.settings.embedding_model,
                    contents=contents,
                    config=types.EmbedContentConfig(output_dimensionality=self.settings.embedding_dimensions),
                )
            )
            if not response.embeddings or len(response.embeddings) != len(contents):
                raise ProviderFailure(502)
            for embedding in response.embeddings:
                values = embedding.values
                if (
                    not values
                    or len(values) != self.settings.embedding_dimensions
                    or not all(math.isfinite(v) for v in values)
                ):
                    raise ProviderFailure(502)
                length = math.sqrt(sum(v * v for v in values))
                if not length:
                    raise ProviderFailure(502)
                vectors.append([v / length for v in values])
        return vectors
