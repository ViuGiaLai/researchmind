"""JSON extraction, schema validation, and conservative repair."""
import json
import re


class StructuredOutputError(ValueError): pass
def parse_structured_output(text: str, required: tuple[str, ...] = ()) -> dict:
    value = (text or "").strip()
    fenced = re.search(r"[\x60]{3}(?:json)?\s*(\{.*?\})\s*[\x60]{3}", value, re.S)
    candidate = fenced.group(1) if fenced else value
    try: data = json.loads(candidate)
    except json.JSONDecodeError:
        start, end = candidate.find("{"), candidate.rfind("}")
        if start < 0 or end <= start: raise StructuredOutputError("No JSON object found")
        try: data = json.loads(candidate[start:end + 1])
        except json.JSONDecodeError as exc: raise StructuredOutputError(f"Invalid JSON: {exc.msg}") from exc
    if not isinstance(data, dict): raise StructuredOutputError("Expected a JSON object")
    missing = [key for key in required if key not in data]
    if missing: raise StructuredOutputError(f"Missing required fields: {', '.join(missing)}")
    return data
