"""Small hashing helpers used for stable identifiers."""
from __future__ import annotations

import hashlib


def short_hash(*parts: str) -> str:
    """Return a short, deterministic hex digest of the joined parts."""
    h = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
    return h[:12]
