import json
from pathlib import Path
from statistics import mean

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.schemas.investigation import RetrievalRequest

from .investigation_service import permitted_services, validate_citations
from .llm_service import LLMProvider
from .providers import ProviderFailure
from .retrieval_service import RetrievalService

DATASET = Path(__file__).resolve().parents[3] / "demo-data/evaluation/cases.json"


class EvaluationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    projectId: str = Field(pattern=r"^[a-f0-9]{24}$")
    readySourceIds: list[str] = Field(max_length=10000)
    topK: int = Field(default=8, ge=1, le=30)
    includeReports: bool = False


def retrieval_metrics(expected, retrieved):
    expected, retrieved = set(expected), set(retrieved)
    hits = len(expected & retrieved)
    return {
        "hit": int(hits > 0),
        "recall": hits / len(expected) if expected else 0,
        "precision": hits / len(retrieved) if retrieved else 0,
    }


def resolve_expected(dataset, chunks):
    return {
        alias: {
            c.evidenceId
            for c in chunks
            if c.fileName == anchor["fileName"]
            and c.lineStart <= anchor["lineEnd"]
            and c.lineEnd >= anchor["lineStart"]
        }
        for alias, anchor in dataset["evidence"].items()
    }


class EvaluationService:
    def __init__(self, pipeline, dataset=None, retrieval=None, llm=None):
        self.pipeline = pipeline
        self.dataset = dataset or json.loads(DATASET.read_text(encoding="utf-8"))
        self.retrieval = retrieval or RetrievalService(pipeline)
        self.llm = llm

    async def run(self, request):
        await self.pipeline.initialize()
        chunks = await self.pipeline.vectors.source_chunks(request.projectId, request.readySourceIds)
        expected = resolve_expected(self.dataset, chunks)
        if any(not value for value in expected.values()):
            raise HTTPException(
                422, "Required evaluation evidence is missing. Upload the supplied ShopFlow files."
            )
        cases, checked, violations, citation_count, valid_citations = [], 0, 0, 0, 0
        for case in self.dataset["cases"]:
            # Ground truth and expected anchors never enter retrieval or generation.
            data = RetrievalRequest(
                projectId=request.projectId,
                readySourceIds=request.readySourceIds,
                incident=case["incident"],
                topK=request.topK,
            )
            expected_ids = set().union(*(expected[alias] for alias in case["expectedEvidenceIds"]))
            result = {
                "id": case["id"],
                "category": case["category"],
                "title": case["incident"]["title"],
                "knownCause": case["knownCause"],
                "expectedEvidenceIds": sorted(expected_ids),
            }
            try:
                evidence, duration = await self.retrieval.retrieve(data)
                retrieved_ids = [e.evidenceId for e in evidence]
                checked += len(evidence)
                violations += sum(
                    e.projectId != request.projectId or e.sourceId not in request.readySourceIds
                    for e in evidence
                )
                result.update(
                    status="COMPLETED",
                    retrievedEvidenceIds=retrieved_ids,
                    retrievalDurationMs=duration,
                    **retrieval_metrics(expected_ids, retrieved_ids),
                )
                if request.includeReports:
                    # Reuse already retrieved evidence so report metrics test the same Top-K.
                    if evidence:
                        services = permitted_services(data.incident, evidence)
                        report = validate_citations(
                            await (self.llm or LLMProvider(self.pipeline.settings)).generate(
                                data.incident, evidence, services
                            ),
                            evidence,
                            services,
                        )
                        refs = [ref for cause in report.suspectedCauses for ref in cause.evidenceIds]
                        citation_count += len(refs)
                        valid_citations += sum(ref in retrieved_ids for ref in refs)
                        result["evidenceSufficiency"] = report.evidenceSufficiency
                    else:
                        result["evidenceSufficiency"] = "INSUFFICIENT"
            except ProviderFailure as error:
                result.update(
                    status="FAILED",
                    error="Provider quota reached. Retry later."
                    if error.status == 429
                    else "Provider or output validation failed.",
                )
            except Exception:
                result.update(status="FAILED", error="Retrieval could not be completed.")
            cases.append(result)
        completed = [c for c in cases if c["status"] == "COMPLETED"]
        return {
            "datasetVersion": self.dataset["version"],
            "topK": request.topK,
            "includeReports": request.includeReports,
            "totalCases": len(cases),
            "completedCases": len(completed),
            "failedCases": len(cases) - len(completed),
            "hitRate": mean(c["hit"] for c in completed) if completed else None,
            "recall": mean(c["recall"] for c in completed) if completed else None,
            "precision": mean(c["precision"] for c in completed) if completed else None,
            "citationValidity": valid_citations / citation_count if citation_count else None,
            "citationCount": citation_count,
            "isolation": {"checkedEvidence": checked, "violations": violations},
            "cases": cases,
        }
