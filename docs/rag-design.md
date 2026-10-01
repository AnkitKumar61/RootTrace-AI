# Retrieval and report design

## Parsing and chunks

Log parsing recognizes JSON records and common timestamp/severity/service formats. It extracts trace/request IDs, HTTP metadata, and error information when available. A malformed structured record still contributes its original text. Indented stack frames and exception continuations stay with their event.

Related log events share chunks when their trace or service context agrees. Documents group paragraphs by headings. Chunks are bounded to approximately 3,500 characters; unusually long lines split while retaining their original line reference. Document headings, sections, and original source line numbers are preserved.

Common password/token patterns are redacted from indexed text. This is a limited pattern-based safeguard, not a general sensitive-data classifier. Original files remain private to their owner and are used for citation viewing.

Chunk IDs use UUIDv5 over project ID, source ID, original line range, and content hash. Reindexing a source produces the same IDs for the same content. Replacement first computes embeddings, then deletes that source's vectors through a project-and-source filter and writes deterministic IDs. A failed replacement never makes an unready source eligible for retrieval; retrying restores the complete source index.

## Embeddings and isolation

The Gemini adapter explicitly sends separate Content items per chunk and verifies one finite, nonzero vector per input. Embeddings are normalized to 768 dimensions. Document input includes a title; query input uses a retrieval query format. Batches contain up to eight documents.

Every Qdrant query requires projectId, permitted READY source IDs, and the configured embedding model. Filtering happens in Qdrant before results return. Optional service, source type, and severity filters are supported internally. Service names and the incident window normally enrich the query without removing potentially useful upstream logs or runbooks.

Top-K defaults to eight and can be configured. A minimum cosine similarity of 0.35 excludes very weak matches. Similarity is displayed as relevance, never as causal certainty. Time-window hard filtering, hybrid search, and reranking are future experiments; the initial pipeline is semantic retrieval with metadata constraints.

## Generation

If no evidence is retrieved, the service returns INSUFFICIENT without calling the generation provider. Otherwise, a controlled prompt includes the incident and evidence as JSON, supplied IDs, filenames, original lines, excerpts, and permitted service names. Ground truth from evaluation never appears in this prompt.

The system rules treat both incident descriptions and uploaded sources as untrusted data. The model has no tools, network actions, or command execution. It must distinguish observed facts from hypotheses, cite evidence IDs, and acknowledge unrelated or incomplete evidence.

LangChain's actual role is `PromptTemplate` formatting. Provider invocation, retries, retrieval, and validation are explicit application code; there are no agents or opaque orchestration chains.

Pydantic rejects extra report fields, invalid sufficiency values, and uncited suspected causes. Application validation rejects unknown evidence IDs and invented affected services. An INSUFFICIENT report must contain no suspected causes; supported report states must contain at least one cited cause. A SUFFICIENT result supported only by scores below 0.6 is conservatively downgraded to PARTIAL.

Express independently validates the returned report, READY source membership, project ownership, line ranges, and citation IDs before saving. Retrieved evidence is an authoritative snapshot from Qdrant, not provider-generated filename or line metadata.

## Stored report

```json
{
  "summary": "Observed symptoms and evidence assessment",
  "suspectedCauses": [
    {
      "cause": "A suspected cause",
      "reasoning": "Concise explanation tied to observations",
      "evidenceIds": ["a-retrieved-chunk-uuid"]
    }
  ],
  "affectedServices": ["payment-service"],
  "nextSteps": ["A suggested verification step"],
  "evidenceSufficiency": "PARTIAL"
}
```

The persisted record also includes retrievedEvidence and modelInformation (provider/model, embedding model, Top-K, retrieval and generation durations). Each evidence record carries its stable ID, source/project identity, filename, original line range, optional section, excerpt, metadata, and retrieval score. Public responses exclude filesystem references and service credentials.

## Practical limits

Schema and citation checks establish that references exist within the retrieved project scope. They cannot prove that every sentence is semantically entailed by those references. Model output still needs engineering review, especially for PARTIAL reports. Prompt instructions reduce injection risk but are not a proof of immunity. No suggested next step executes automatically.

Provider transient errors receive at most three bounded attempts. Authentication/model failures return safe errors; quota exhaustion returns 429. Failed investigations remain visible in history and can be rerun. There is no fabricated fallback report or automatic billing change.
