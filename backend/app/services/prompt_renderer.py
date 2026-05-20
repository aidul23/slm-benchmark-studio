"""Simple `{{variable}}` template renderer used for benchmark + judge prompts."""
from __future__ import annotations

import re
from typing import Any, Dict, Mapping, Optional

_VARIABLE_RE = re.compile(r"{{\s*([a-zA-Z0-9_]+)\s*}}")


def render(template: str, variables: Mapping[str, Any]) -> str:
    """Substitute `{{name}}` placeholders.

    Unknown variables are left untouched so they remain visible during debugging.
    `None` values are rendered as empty strings.
    """

    def replace(match: "re.Match[str]") -> str:
        key = match.group(1)
        if key not in variables:
            return match.group(0)
        value = variables[key]
        return "" if value is None else str(value)

    return _VARIABLE_RE.sub(replace, template)


def example_variables(
    *,
    input_text: str,
    reference: Optional[str] = None,
    category: Optional[str] = None,
    difficulty: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build the standard variable dictionary used in benchmark prompts."""
    variables: Dict[str, Any] = {
        "input": input_text,
        "reference": reference or "",
        "category": category or "",
        "difficulty": difficulty or "",
    }
    if extra:
        variables.update(extra)
    return variables
