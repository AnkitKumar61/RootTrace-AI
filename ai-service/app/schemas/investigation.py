from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class IncidentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=10, max_length=6000)
    affectedService: str = Field(default="", max_length=120)
    startTime: str | None = None
    endTime: str | None = None


class RetrievalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    projectId: str = Field(pattern=r"^[a-f0-9]{24}$")
    readySourceIds: list[str] = Field(max_length=10000)
    incident: IncidentInput
    topK: int | None = Field(default=None, ge=1, le=30)
    filters: dict[str, str] = Field(default_factory=dict)


class Cause(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cause: str = Field(min_length=1, max_length=500)
    reasoning: str = Field(min_length=1, max_length=2000)
    evidenceIds: list[str] = Field(min_length=1, max_length=30)


class Report(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str = Field(min_length=1, max_length=3000)
    suspectedCauses: list[Cause] = Field(max_length=8)
    affectedServices: list[Annotated[str, Field(min_length=1, max_length=120)]] = Field(max_length=20)
    nextSteps: list[Annotated[str, Field(min_length=1, max_length=1000)]] = Field(min_length=1, max_length=12)
    evidenceSufficiency: Literal["SUFFICIENT", "PARTIAL", "INSUFFICIENT"]
