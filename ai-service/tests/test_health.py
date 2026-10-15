from fastapi.testclient import TestClient

from app.main import app


def test_health():
    assert TestClient(app).get("/health").json()["status"] == "ok"


def test_retired_benchmark_route_is_not_available():
    assert TestClient(app).post("/internal/evaluate", json={}).status_code == 404
