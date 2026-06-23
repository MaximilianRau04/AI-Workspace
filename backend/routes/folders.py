import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import get_session
from models.chat import ChatSession
from models.folder import Folder
from utils import login_required

router = APIRouter(tags=["folders"])


class FolderBody(BaseModel):
    name: str


@router.get("/folders")
async def list_folders(current_user: dict = Depends(login_required)):
    user_id = current_user["user_id"]
    with get_session() as db:
        rows = (
            db.query(Folder)
            .filter(Folder.user_id == user_id)
            .order_by(Folder.created_at.asc())
            .all()
        )
        return {"folders": [{"id": r.id, "name": r.name, "created_at": r.created_at} for r in rows]}


@router.post("/folders")
async def create_folder(body: FolderBody, current_user: dict = Depends(login_required)):
    user_id = current_user["user_id"]
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    now = datetime.utcnow().isoformat()
    folder_id = str(uuid.uuid4())
    with get_session() as db:
        db.add(Folder(id=folder_id, user_id=user_id, name=name, created_at=now))
    return {"id": folder_id, "name": name, "created_at": now}


@router.patch("/folders/{folder_id}")
async def rename_folder(
    folder_id: str,
    body: FolderBody,
    current_user: dict = Depends(login_required),
):
    user_id = current_user["user_id"]
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    with get_session() as db:
        folder = db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == user_id).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
        folder.name = name
    return {"ok": True}


@router.delete("/folders/{folder_id}")
async def delete_folder(folder_id: str, current_user: dict = Depends(login_required)):
    user_id = current_user["user_id"]
    with get_session() as db:
        folder = db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == user_id).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
        db.query(ChatSession).filter(ChatSession.folder_id == folder_id).update({"folder_id": None})
        db.delete(folder)
    return {"ok": True}
