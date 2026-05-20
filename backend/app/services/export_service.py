"""CSV export helpers."""
from __future__ import annotations

import io
from typing import List

import pandas as pd
from sqlmodel import Session

from . import metrics


def run_results_to_csv(session: Session, run_id: int) -> bytes:
    rows = metrics.fetch_result_rows(session, run_id)
    if not rows:
        return b""

    records: List[dict] = []
    for row in rows:
        judge = row.judge
        records.append(
            {
                "output_id": row.output_id,
                "run_id": row.run_id,
                "example_id": row.example_id,
                "external_id": row.external_id,
                "model_name": row.model_name,
                "category": row.category,
                "difficulty": row.difficulty,
                "input": row.input,
                "reference": row.reference,
                "output": row.output,
                "latency_ms": row.latency_ms,
                "tokens_per_second": row.tokens_per_second,
                "prompt_eval_count": row.prompt_eval_count,
                "eval_count": row.eval_count,
                "error": row.error,
                "judge_model": judge.judge_model if judge else None,
                "correctness": judge.correctness if judge else None,
                "factuality": judge.factuality if judge else None,
                "completeness": judge.completeness if judge else None,
                "conciseness": judge.conciseness if judge else None,
                "instruction_following": judge.instruction_following if judge else None,
                "overall": judge.overall if judge else None,
                "reason": judge.reason if judge else None,
                "judge_parse_error": judge.parse_error if judge else None,
                "human_score": judge.human_score if judge else None,
                "human_notes": judge.human_notes if judge else None,
                "accepted_judge_score": judge.accepted_judge_score if judge else None,
            }
        )

    df = pd.DataFrame.from_records(records)
    buffer = io.StringIO()
    df.to_csv(buffer, index=False)
    return buffer.getvalue().encode("utf-8")
