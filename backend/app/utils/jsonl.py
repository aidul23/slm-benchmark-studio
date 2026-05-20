"""Helpers for parsing JSONL datasets."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional


@dataclass
class ParsedExample:
    input: str
    reference: Optional[str] = None
    category: Optional[str] = None
    difficulty: Optional[str] = None
    external_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class ParseResult:
    examples: List[ParsedExample] = field(default_factory=list)
    skipped: int = 0
    errors: List[str] = field(default_factory=list)


def parse_jsonl(content: str | bytes) -> ParseResult:
    """Parse a JSONL string/bytes payload into structured examples."""
    if isinstance(content, bytes):
        try:
            content = content.decode("utf-8")
        except UnicodeDecodeError:
            content = content.decode("utf-8", errors="replace")

    result = ParseResult()
    for line_no, raw in enumerate(_iter_lines(content), start=1):
        line = raw.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError as exc:
            result.skipped += 1
            result.errors.append(f"line {line_no}: invalid JSON ({exc.msg})")
            continue

        if not isinstance(obj, dict):
            result.skipped += 1
            result.errors.append(f"line {line_no}: expected object, got {type(obj).__name__}")
            continue

        input_value = obj.get("input") or obj.get("prompt") or obj.get("question")
        if not isinstance(input_value, str) or not input_value.strip():
            result.skipped += 1
            result.errors.append(f"line {line_no}: missing or empty 'input'")
            continue

        reference = obj.get("reference") or obj.get("expected") or obj.get("answer")
        category = obj.get("category")
        difficulty = obj.get("difficulty")
        external_id = obj.get("id") or obj.get("external_id")
        metadata = obj.get("metadata") if isinstance(obj.get("metadata"), dict) else None

        # Stash unknown keys into metadata for traceability.
        known_keys = {
            "input",
            "prompt",
            "question",
            "reference",
            "expected",
            "answer",
            "category",
            "difficulty",
            "id",
            "external_id",
            "metadata",
        }
        extras = {k: v for k, v in obj.items() if k not in known_keys}
        if extras:
            if metadata is None:
                metadata = {}
            metadata.setdefault("extra", {}).update(extras)

        result.examples.append(
            ParsedExample(
                input=input_value,
                reference=str(reference) if reference is not None else None,
                category=str(category) if category is not None else None,
                difficulty=str(difficulty) if difficulty is not None else None,
                external_id=str(external_id) if external_id is not None else None,
                metadata=metadata,
            )
        )
    return result


def _iter_lines(content: str) -> Iterable[str]:
    # Support both \n and \r\n line endings.
    for line in content.splitlines():
        yield line


def metadata_to_json(metadata: Optional[Dict[str, Any]]) -> Optional[str]:
    if metadata is None:
        return None
    try:
        return json.dumps(metadata, ensure_ascii=False)
    except (TypeError, ValueError):
        return None


def metadata_from_json(text: Optional[str]) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None
