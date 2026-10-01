import asyncio
import json
from collections import Counter
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.schemas.evidence import Evidence
from app.services.chunking_service import chunk_source
from app.services.evaluation_service import (
    DATASET,
    EvaluationRequest,
    EvaluationService,
    resolve_expected,
    retrieval_metrics,
)
from app.services.providers import ProviderFailure


def test_dataset_has_fifteen_cases_and_original_line_anchors():
    dataset = json.loads(DATASET.read_text())
    assert len(dataset["cases"]) == 15
    assert set(Counter(c["category"] for c in dataset["cases"]).values()) == {3}
    chunks = []
    for folder, kind in [("logs", "log"), ("docs", "document")]:
        for file in (DATASET.parents[1] / folder).iterdir():
            chunks.extend(
                chunk_source(
                    file.read_text(),
                    project_id="a" * 24,
                    source_id="b" * 24,
                    file_name=file.name,
                    source_type=kind,
                )
            )
    items = [Evidence(**c.model_dump(), evidenceId=c.chunkId, score=0.8) for c in chunks]
    assert all(resolve_expected(dataset, items).values())
    assert retrieval_metrics({"a", "b"}, ["a", "c", "d"]) == {"hit": 1, "recall": 0.5, "precision": 1 / 3}


def test_evaluation_keeps_truth_out_of_query_and_surfaces_failures():
    async def run():
        dataset = {
            "version": "fixture",
            "evidence": {"anchor": {"fileName": "a.log", "lineStart": 1, "lineEnd": 2}},
            "cases": [
                {
                    "id": str(i),
                    "category": "timeout",
                    "incident": {"title": "Timeout", "description": "Payment timed out."},
                    "knownCause": "SECRET GROUND TRUTH",
                    "expectedEvidenceIds": ["anchor"],
                }
                for i in range(2)
            ],
        }
        chunk = chunk_source(
            "ERROR timeout", project_id="a" * 24, source_id="b" * 24, file_name="a.log", source_type="log"
        )[0]
        item = Evidence(**chunk.model_dump(), evidenceId=chunk.chunkId, score=0.8)
        pipeline = SimpleNamespace(
            initialize=AsyncMock(), vectors=SimpleNamespace(source_chunks=AsyncMock(return_value=[item]))
        )
        retrieval = SimpleNamespace(retrieve=AsyncMock(side_effect=[([item], 1), ProviderFailure(429)]))
        value = await EvaluationService(pipeline, dataset, retrieval).run(
            EvaluationRequest(projectId="a" * 24, readySourceIds=["b" * 24])
        )
        assert value["hitRate"] == 1 and value["completedCases"] == 1 and value["failedCases"] == 1
        assert value["citationValidity"] is None and value["isolation"]["violations"] == 0
        assert "SECRET GROUND TRUTH" not in retrieval.retrieve.call_args.args[0].model_dump_json()
        assert value["cases"][1]["error"] == "Provider quota reached. Retry later."

    asyncio.run(run())
