from app.services.chunking_service import chunk_source


def chunks(text, kind="document", limit=3500):
    return chunk_source(
        text,
        project_id="project-a",
        source_id="source-a",
        file_name="source.md",
        source_type=kind,
        max_chars=limit,
    )


def test_sections_original_lines_and_stable_ids():
    text = "# Overview\nService architecture.\n\n## Payment failures\nCheck gateway connectivity.\n\nConfirm timeout settings.\n"
    result = chunks(text)
    assert len(result) == 2
    assert result[1].section == "Payment failures"
    assert (result[1].lineStart, result[1].lineEnd) == (4, 7)
    assert result[0].chunkId == chunks(text)[0].chunkId
    assert result[1].chunkId != result[0].chunkId


def test_traces_stay_together_and_large_content_is_bounded():
    text = "2026-09-30T10:00:00Z ERROR checkout-service traceId=t1 timeout\n  at charge\n2026-09-30T10:00:01Z ERROR payment-service traceId=t1 gateway failed\n2026-09-30T10:00:02Z INFO auth-service traceId=t2 ready"
    result = chunks(text, "log")
    assert (result[0].lineStart, result[0].lineEnd) == (1, 3)
    assert result[0].metadata["services"] == ["checkout-service", "payment-service"]
    oversized = chunks("line\n" + "x" * 500 + "\nend", limit=100)
    assert all(len(chunk.text) <= 100 for chunk in oversized)
    assert all(chunk.lineStart >= 1 and chunk.lineEnd >= chunk.lineStart for chunk in oversized)
