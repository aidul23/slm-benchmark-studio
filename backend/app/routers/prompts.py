"""Prompt template CRUD endpoints."""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..database import get_session
from ..models.prompt_template import PromptTemplate
from ..schemas.prompt_template import (
    PromptPreviewRequest,
    PromptPreviewResponse,
    PromptTemplateCreate,
    PromptTemplateRead,
    PromptTemplateUpdate,
)
from ..services import prompt_renderer


router = APIRouter(prefix="/api/prompts", tags=["prompts"])


def _to_read(template: PromptTemplate) -> PromptTemplateRead:
    return PromptTemplateRead(
        id=template.id or 0,
        name=template.name,
        template=template.template,
        system_prompt=template.system_prompt,
        version=template.version,
        created_at=template.created_at,
        notes=template.notes,
    )


@router.get("", response_model=List[PromptTemplateRead])
def list_prompts(session: Session = Depends(get_session)) -> List[PromptTemplateRead]:
    items = session.exec(select(PromptTemplate).order_by(PromptTemplate.created_at.desc())).all()
    return [_to_read(t) for t in items]


@router.post("", response_model=PromptTemplateRead)
def create_prompt(payload: PromptTemplateCreate, session: Session = Depends(get_session)) -> PromptTemplateRead:
    template = PromptTemplate(
        name=payload.name,
        template=payload.template,
        system_prompt=payload.system_prompt,
        version=payload.version,
        notes=payload.notes,
    )
    session.add(template)
    session.commit()
    session.refresh(template)
    return _to_read(template)


@router.get("/{prompt_id}", response_model=PromptTemplateRead)
def get_prompt(prompt_id: int, session: Session = Depends(get_session)) -> PromptTemplateRead:
    template = session.get(PromptTemplate, prompt_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Prompt template not found")
    return _to_read(template)


@router.put("/{prompt_id}", response_model=PromptTemplateRead)
def update_prompt(
    prompt_id: int,
    payload: PromptTemplateUpdate,
    session: Session = Depends(get_session),
) -> PromptTemplateRead:
    template = session.get(PromptTemplate, prompt_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Prompt template not found")

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(template, key, value)
    session.add(template)
    session.commit()
    session.refresh(template)
    return _to_read(template)


@router.delete("/{prompt_id}")
def delete_prompt(prompt_id: int, session: Session = Depends(get_session)) -> dict:
    template = session.get(PromptTemplate, prompt_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Prompt template not found")
    session.delete(template)
    session.commit()
    return {"ok": True}


@router.post("/preview", response_model=PromptPreviewResponse)
def preview_prompt(payload: PromptPreviewRequest) -> PromptPreviewResponse:
    variables = prompt_renderer.example_variables(
        input_text=payload.sample_input,
        reference=payload.sample_reference,
        category=payload.sample_category,
        difficulty=payload.sample_difficulty,
    )
    rendered = prompt_renderer.render(payload.template, variables)
    return PromptPreviewResponse(system_prompt=payload.system_prompt, rendered_prompt=rendered)
