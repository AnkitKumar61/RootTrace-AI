from app.services.parsing_service import metadata, parse_logs


def test_formats_stack_trace_and_original_line_numbers():
    text = "2026-09-30T10:00:00Z ERROR payment-service requestId=req-4 traceId=trace-4 POST /charge status=504\r\n  at connect (gateway.js:42)\r\nCaused by: TimeoutError\r\nINFO healthy\r\n{bad json}\r\n"
    units = parse_logs(text)
    assert (units[0].line_start, units[0].line_end) == (1, 3)
    assert units[0].metadata["service"] == "payment-service"
    assert units[0].metadata["httpStatus"] == "504"
    assert "gateway.js:42" in units[0].text
    assert units[-1].text == "{bad json}"


def test_json_metadata_and_redaction():
    assert metadata(
        '{"level":"error","service":"checkout-service","request_id":"r1","timestamp":"invalid"}'
    ) == {"severity": "ERROR", "service": "checkout-service", "requestId": "r1"}
    assert "[redacted]" in parse_logs("INFO Authorization: Bearer demonstration")[0].text
