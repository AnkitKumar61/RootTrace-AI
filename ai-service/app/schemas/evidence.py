from pydantic import BaseModel, Field


class Chunk(BaseModel):
    chunkId: str
    sourceId: str
    projectId: str
    fileName: str
    chunkType: str
    lineStart: int = Field(ge=1)
    lineEnd: int = Field(ge=1)
    text: str
    section: str | None = None
    metadata: dict = Field(default_factory=dict)


class Evidence(Chunk):
    evidenceId: str
    score: float
