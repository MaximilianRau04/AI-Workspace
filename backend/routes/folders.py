import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from werkzeug.utils import secure_filename

import rag
from db import get_session
from models.chat import ChatSession
from models.document import Document
from models.folder import Folder
from utils import login_required

ALLOWED_EXTENSIONS = {".txt", ".md", ".pdf"}


class DeleteDocBody(BaseModel):
    file: str = ""


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


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
        # Remove all folder docs from ChromaDB
        for doc in (
            db.query(Document)
            .filter(Document.user_id == user_id, Document.folder_id == folder_id)
            .all()
        ):
            rag.delete_folder_file(doc.filename, user_id, folder_id)
            db.delete(doc)
        db.query(ChatSession).filter(ChatSession.folder_id == folder_id).update({"folder_id": None})
        db.delete(folder)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Folder document routes
# ---------------------------------------------------------------------------


@router.get("/folders/{folder_id}/docs")
async def list_folder_docs(folder_id: str, current_user: dict = Depends(login_required)):
    user_id = current_user["user_id"]
    with get_session() as db:
        folder = db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == user_id).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
        docs = (
            db.query(Document)
            .filter(Document.user_id == user_id, Document.folder_id == folder_id)
            .all()
        )
        return {"files": [d.filename for d in docs]}


@router.post("/folders/{folder_id}/docs/upload")
async def upload_folder_doc(
    folder_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(login_required),
):
    user_id = current_user["user_id"]
    with get_session() as db:
        folder = db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == user_id).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No file")
    filename = secure_filename(file.filename)
    ext = filename[filename.rfind(".") :].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400, detail=f"Unsupported type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    content_bytes = await file.read()
    text = rag.extract_text(content_bytes, filename)
    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from file")

    with get_session() as db:
        existing = (
            db.query(Document)
            .filter(
                Document.user_id == user_id,
                Document.folder_id == folder_id,
                Document.filename == filename,
            )
            .first()
        )
        if existing:
            existing.content = text
            existing.created_at = _now_iso()
        else:
            db.add(
                Document(
                    user_id=user_id,
                    filename=filename,
                    content=text,
                    created_at=_now_iso(),
                    folder_id=folder_id,
                )
            )

    chunks = rag.index_folder_file(filename, user_id, folder_id, text)
    return {"file": filename, "chunks": chunks}


@router.post("/folders/{folder_id}/docs/delete")
async def delete_folder_doc(
    folder_id: str,
    body: DeleteDocBody,
    current_user: dict = Depends(login_required),
):
    user_id = current_user["user_id"]
    if not body.file:
        raise HTTPException(status_code=400, detail="No filename")

    with get_session() as db:
        folder = db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == user_id).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
        doc = (
            db.query(Document)
            .filter(
                Document.user_id == user_id,
                Document.folder_id == folder_id,
                Document.filename == body.file,
            )
            .first()
        )
        if doc:
            db.delete(doc)

    rag.delete_folder_file(body.file, user_id, folder_id)
    return {"ok": True}
