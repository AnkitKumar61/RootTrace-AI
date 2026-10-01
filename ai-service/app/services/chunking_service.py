import hashlib
import re
from uuid import NAMESPACE_URL, uuid5

from app.schemas.evidence import Chunk

from .parsing_service import Unit, parse_logs, redact


def parse_documents(text):
    units, lines, section = [], [], None
    start = 1

    def flush(end):
        if lines:
            units.append(Unit(redact("\n".join(lines)), start, end, {}, section))
            lines.clear()

    for number, line in enumerate(text.splitlines(), 1):
        heading = re.match(r"^#{1,6}\s+(.+)", line)
        if heading:
            flush(number - 1)
            section = heading.group(1).strip()
        if not line.strip():
            flush(number - 1)
            continue
        if not lines:
            start = number
        lines.append(line)
    flush(start + len(lines) - 1)
    return units


def bounded_units(units, max_chars):
    for unit in units:
        if len(unit.text) <= max_chars:
            yield unit
            continue
        content, start, size = [], unit.line_start, 0
        for offset, line in enumerate(unit.text.split("\n")):
            number = unit.line_start + offset
            if content and size + len(line) > max_chars:
                yield Unit("\n".join(content), start, number - 1, unit.metadata, unit.section)
                content, size = [], 0
            if len(line) > max_chars:
                if content:
                    yield Unit("\n".join(content), start, number - 1, unit.metadata, unit.section)
                    content, size = [], 0
                for position in range(0, len(line), max_chars):
                    yield Unit(
                        line[position : position + max_chars], number, number, unit.metadata, unit.section
                    )
                continue
            if not content:
                start = number
            content.append(line)
            size += len(line) + 1
        if content:
            yield Unit("\n".join(content), start, unit.line_end, unit.metadata, unit.section)


def chunk_source(text, *, project_id, source_id, file_name, source_type, max_chars=3500):
    units = parse_logs(text) if source_type == "log" else parse_documents(text)
    chunks, group = [], []

    def flush():
        if not group:
            return
        content = "\n".join(unit.text for unit in group)
        details = {}
        for key in [
            "service",
            "severity",
            "timestamp",
            "requestId",
            "traceId",
            "method",
            "endpoint",
            "httpStatus",
            "error",
        ]:
            values = list(dict.fromkeys(u.metadata[key] for u in group if key in u.metadata))
            if values:
                details[key] = values[0]
                if key == "service":
                    details["services"] = values
        severities = [u.metadata.get("severity", "") for u in group]
        for severity in ["FATAL", "CRITICAL", "ERROR", "WARN", "INFO", "DEBUG", "TRACE"]:
            if severity in severities:
                details["severity"] = severity
                break
        content_hash = hashlib.sha256(content.encode()).hexdigest()
        identifier = str(
            uuid5(
                NAMESPACE_URL,
                f"{project_id}/{source_id}/{group[0].line_start}/{group[-1].line_end}/{content_hash}",
            )
        )
        chunks.append(
            Chunk(
                chunkId=identifier,
                projectId=project_id,
                sourceId=source_id,
                fileName=file_name,
                chunkType=source_type,
                lineStart=group[0].line_start,
                lineEnd=group[-1].line_end,
                text=content,
                section=group[0].section,
                metadata=details,
            )
        )
        group.clear()

    for unit in bounded_units(units, max_chars):
        different_section = source_type != "log" and group and unit.section != group[0].section
        different_trace = (
            source_type == "log"
            and group
            and unit.metadata.get("traceId")
            and group[-1].metadata.get("traceId")
            and unit.metadata["traceId"] != group[-1].metadata["traceId"]
        )
        different_service = (
            source_type == "log"
            and group
            and unit.metadata.get("service") != group[-1].metadata.get("service")
            and not (
                unit.metadata.get("traceId")
                and unit.metadata.get("traceId") == group[-1].metadata.get("traceId")
            )
        )
        if group and (
            different_section
            or different_trace
            or different_service
            or sum(len(u.text) + 1 for u in group) + len(unit.text) > max_chars
        ):
            flush()
        group.append(unit)
    flush()
    return chunks
