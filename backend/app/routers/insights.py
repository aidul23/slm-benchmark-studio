"""Aggregated insights endpoints used by the dashboard."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from ..database import get_session
from ..schemas.result import InsightsOverview
from ..services import metrics
from ..workshop import ParticipantContext, get_participant


router = APIRouter(prefix="/api/insights", tags=["insights"])


@router.get("/overview", response_model=InsightsOverview)
def overview(
    session: Session = Depends(get_session),
    participant: ParticipantContext = Depends(get_participant),
) -> InsightsOverview:
    return metrics.build_insights_overview(session, participant)
