import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

@dataclass
class Unit:
    text: str
    line_start: int
    line_end: int
    metadata: dict = field(default_factory=dict)
    section: str | None = None

def timestamp(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat()
    except ValueError:
        return None

def redact(text):
    text = re.sub(r'(?i)(authorization\s*[:=]\s*bearer\s+)\S+', r'\1[redacted]', text)
    return re.sub(r'(?i)((?:password|api[_-]?key|secret|access[_-]?token)\s*[=:]\s*)[^\s,;]+', r'\1[redacted]', text)

def metadata(line):
    data = {}
    try:
        decoded = json.loads(line)
        if isinstance(decoded, dict):
            data = decoded
    except (json.JSONDecodeError, ValueError):
        pass
    result = {}
    aliases = {'severity': ['severity', 'level'], 'service': ['service', 'serviceName'], 'timestamp': ['timestamp', 'time', '@timestamp'], 'requestId': ['requestId', 'request_id'], 'traceId': ['traceId', 'trace_id'], 'method': ['method', 'httpMethod'], 'endpoint': ['endpoint', 'path'], 'httpStatus': ['status', 'statusCode'], 'error': ['error']}
    for key, names in aliases.items():
        for name in names:
            value = data.get(name)
            if isinstance(value, (str, int)):
                result[key] = str(value)[:500]
                break
    patterns = {
        'timestamp': r'\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)',
        'severity': r'\b(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|CRITICAL|FATAL)\b',
        'service': r'\b([\w-]+-service)\b',
        'requestId': r'\brequest[Ii]d[=: ]+([\w-]+)',
        'traceId': r'\btrace[Ii]d[=: ]+([\w-]+)',
        'method': r'\b(GET|POST|PUT|PATCH|DELETE|HEAD)\b',
        'endpoint': r'\b(?:GET|POST|PUT|PATCH|DELETE|HEAD)\s+(/[^\s?]*)',
        'httpStatus': r'\b(?:status|statusCode)[=: ]+(\d{3})'
    }
    for key, pattern in patterns.items():
        match = re.search(pattern, line)
        if key not in result and match:
            result[key] = match.group(1)
    if 'timestamp' in result:
        result['timestamp'] = timestamp(result['timestamp'])
    if 'severity' in result:
        result['severity'] = result['severity'].upper().replace('WARNING', 'WARN')
    return {key: value for key, value in result.items() if value is not None}

def parse_logs(text):
    units = []
    for number, line in enumerate(text.splitlines(), 1):
        if not line.strip():
            if units:
                units[-1].text += '\n'
                units[-1].line_end = number
            continue
        details = metadata(line)
        continuation = not details.get('timestamp') and not details.get('severity') and (line.startswith((' ', '\t', 'Traceback', 'Caused by:')) or re.match(r'^[\w.]+(?:Error|Exception):', line))
        if units and continuation:
            units[-1].text += '\n' + redact(line)
            units[-1].line_end = number
        else:
            units.append(Unit(redact(line), number, number, details))
    return units
