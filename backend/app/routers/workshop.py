"""Workshop mode status for the frontend."""
from __future__ import annotations

from pydantic import BaseModel

from fastapi import APIRouter

from ..config import get_settings


router = APIRouter(prefix="/api/workshop", tags=["workshop"])


class WorkshopStatus(BaseModel):
    workshop_mode: bool


@router.get("/status", response_model=WorkshopStatus)
def workshop_status() -> WorkshopStatus:
    settings = get_settings()
    return WorkshopStatus(workshop_mode=settings.workshop_mode)
