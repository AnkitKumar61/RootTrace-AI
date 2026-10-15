from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import app
from app.routes.ingestion import deleted_projects
from app.services.pipeline import get_pipeline
from app.services.providers import ProviderFailure


class Embeddings:
    async def embed_batch(self, texts, **kwargs):
        return [[1.0, 0.0] for _ in texts]


class Vectors:
    async def replace_source(self, project, source, chunks, vectors):
        assert len(chunks) == len(vectors)
        assert all(chunk.projectId == project for chunk in chunks)
        return len(chunks)

    async def delete_project(self, project):
        pass


class FakePipeline:
    settings = SimpleNamespace(max_file_size_mb=20)
    embeddings = Embeddings()
    vectors = Vectors()

    async def initialize(self):
        pass


def test_internal_auth_ingestion_validation_and_deleted_project_barrier():
    client = TestClient(app)
    app.dependency_overrides[get_pipeline] = FakePipeline
    project = "a" * 24
    form = {"projectId": project, "sourceId": "b" * 24, "sourceType": "log"}
    files = {"file": ("payment.log", b"ERROR payment-service timeout", "text/plain")}
    headers = {"X-Service-Secret": "test-only-internal-service-value-12345"}
    try:
        assert client.post("/internal/ingest", data=form, files=files).status_code == 401
        assert (
            client.post("/internal/ingest", data=form, files=files, headers=headers).json()["chunkCount"] == 1
        )
        assert (
            client.post(
                "/internal/ingest", data=form, files={"file": ("binary.log", b"\xff")}, headers=headers
            ).status_code
            == 422
        )
        assert client.delete(f"/internal/projects/{project}", headers=headers).status_code == 200
        assert client.post("/internal/ingest", data=form, files=files, headers=headers).status_code == 409
        assert client.delete(f"/internal/projects/{project}", headers=headers).status_code == 200
    finally:
        app.dependency_overrides.clear()
        deleted_projects.clear()


def test_ingestion_quota_failure_has_safe_reason_and_retry_timing():
    class LimitedEmbeddings:
        async def embed_batch(self, texts, **kwargs):
            raise ProviderFailure(429, retry_after=120)

    pipeline = FakePipeline()
    pipeline.embeddings = LimitedEmbeddings()
    app.dependency_overrides[get_pipeline] = lambda: pipeline
    try:
        response = TestClient(app).post(
            "/internal/ingest",
            data={"projectId": "c" * 24, "sourceId": "d" * 24, "sourceType": "document"},
            files={"file": ("notes.txt", b"Fictional service configuration notes.", "text/plain")},
            headers={"X-Service-Secret": "test-only-internal-service-value-12345"},
        )
        assert response.status_code == 429
        assert response.headers["retry-after"] == "120"
        assert response.json() == {"detail": "Provider quota reached. Retry later."}
    finally:
        app.dependency_overrides.clear()
