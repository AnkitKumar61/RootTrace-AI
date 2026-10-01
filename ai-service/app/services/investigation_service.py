import re
from time import perf_counter

from app.schemas.investigation import Report

from .llm_service import LLMProvider
from .providers import ProviderFailure
from .retrieval_service import RetrievalService


def permitted_services(incident, evidence):
    services = {incident.affectedService} if incident.affectedService else set()
    for item in evidence:
        services.update(item.metadata.get("services", []))
        services.update(re.findall(r"\b[a-z][a-z0-9]*(?:-[a-z0-9]+)*-service\b", item.text))
    return services


def validate_citations(report, evidence, services):
    identifiers = {item.evidenceId for item in evidence}
    if any(not set(cause.evidenceIds).issubset(identifiers) for cause in report.suspectedCauses):
        raise ProviderFailure(502)
    if not set(report.affectedServices).issubset(services):
        raise ProviderFailure(502)
    if report.evidenceSufficiency == "INSUFFICIENT" and report.suspectedCauses:
        raise ProviderFailure(502)
    if report.evidenceSufficiency != "INSUFFICIENT" and not report.suspectedCauses:
        raise ProviderFailure(502)
    return report


class InvestigationService:
    def __init__(self, pipeline, llm=None, retrieval=None):
        self.pipeline = pipeline
        self.llm = llm
        self.retrieval = retrieval or RetrievalService(pipeline)

    async def investigate(self, request):
        evidence, retrieval_ms = await self.retrieval.retrieve(request)
        started = perf_counter()
        if not evidence:
            report = Report(
                summary="No relevant evidence is available from ready sources in this project.",
                suspectedCauses=[],
                affectedServices=[],
                nextSteps=[
                    "Upload relevant logs and runbooks, wait until they are ready, and investigate again."
                ],
                evidenceSufficiency="INSUFFICIENT",
            )
            generation_ms = 0
        else:
            services = permitted_services(request.incident, evidence)
            llm = self.llm or LLMProvider(self.pipeline.settings)
            report = validate_citations(
                await llm.generate(request.incident, evidence, services), evidence, services
            )
            if report.evidenceSufficiency == "SUFFICIENT" and max(e.score for e in evidence) < 0.6:
                report.evidenceSufficiency = "PARTIAL"
            generation_ms = round((perf_counter() - started) * 1000)
        return {
            **report.model_dump(),
            "retrievedEvidence": [e.model_dump() for e in evidence],
            "modelInformation": {
                "provider": self.pipeline.settings.llm_provider,
                "model": self.pipeline.settings.llm_model if evidence else "not-called",
                "embeddingModel": self.pipeline.settings.embedding_model,
                "topK": request.topK or self.pipeline.settings.retrieval_top_k,
                "retrievalDurationMs": retrieval_ms,
                "generationDurationMs": generation_ms,
            },
        }
