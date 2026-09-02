import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import get_session
from models.chat import ChatSession
from models.prompt import Prompt
from utils import login_required

router = APIRouter(tags=["prompts"])


class PromptBody(BaseModel):
    name: str
    content: str = ""


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


@router.get("/prompts")
async def list_prompts(current_user: dict = Depends(login_required)):
    user_id = current_user["user_id"]
    with get_session() as db:
        rows = (
            db.query(Prompt)
            .filter(Prompt.user_id == user_id)
            .order_by(Prompt.created_at.asc())
            .all()
        )
        return {
            "prompts": [
                {"id": r.id, "name": r.name, "content": r.content, "created_at": r.created_at}
                for r in rows
            ]
        }


@router.post("/prompts")
async def create_prompt(body: PromptBody, current_user: dict = Depends(login_required)):
    user_id = current_user["user_id"]
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    now = _now_iso()
    prompt_id = str(uuid.uuid4())
    with get_session() as db:
        db.add(
            Prompt(
                id=prompt_id,
                user_id=user_id,
                name=name,
                content=body.content.strip(),
                created_at=now,
            )
        )
    return {"id": prompt_id, "name": name, "content": body.content.strip(), "created_at": now}


@router.patch("/prompts/{prompt_id}")
async def update_prompt(
    prompt_id: str,
    body: PromptBody,
    current_user: dict = Depends(login_required),
):
    user_id = current_user["user_id"]
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    with get_session() as db:
        prompt = db.query(Prompt).filter(Prompt.id == prompt_id, Prompt.user_id == user_id).first()
        if not prompt:
            raise HTTPException(status_code=404, detail="Prompt not found")
        prompt.name = name
        prompt.content = body.content.strip()
    return {"ok": True}


@router.delete("/prompts/{prompt_id}")
async def delete_prompt(prompt_id: str, current_user: dict = Depends(login_required)):
    user_id = current_user["user_id"]
    with get_session() as db:
        prompt = db.query(Prompt).filter(Prompt.id == prompt_id, Prompt.user_id == user_id).first()
        if not prompt:
            raise HTTPException(status_code=404, detail="Prompt not found")
        db.query(ChatSession).filter(ChatSession.prompt_id == prompt_id).update({"prompt_id": None})
        db.delete(prompt)
    return {"ok": True}
