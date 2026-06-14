from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from werkzeug.utils import secure_filename

import rag
from db import get_session
from models.document import Document
from utils import login_required

router = APIRouter(tags=["docs"])

ALLOWED_EXTENSIONS = {".txt", ".md", ".pdf"}


class DeleteBody(BaseModel):
    file: str = ""


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


@router.get("/docs")
async def list_docs(current_user: dict = Depends(login_required)):
    user_id = current_user["user_id"]
    with get_session() as db:
        docs = db.query(Document).filter(Document.user_id == user_id).all()
        return {"files": [d.filename for d in docs]}


@router.post("/docs/upload")
async def upload_doc(
    file: UploadFile = File(...),
    current_user: dict = Depends(login_required),
):
    user_id = current_user["user_id"]
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file")
    filename = secure_filename(file.filename)
    ext = filename[filename.rfind("."):].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    content_bytes = await file.read()
    text = rag.extract_text(content_bytes, filename)
    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from file")

    with get_session() as db:
        existing = db.query(Document).filter(
            Document.user_id == user_id, Document.filename == filename
        ).first()
        if existing:
            existing.content = text
            existing.created_at = _now_iso()
        else:
            db.add(Document(
                user_id=user_id,
                filename=filename,
                content=text,
                created_at=_now_iso(),
            ))

    chunks = rag.index_file(filename, user_id, text)
    return {"file": filename, "chunks": chunks}


@router.post("/docs/delete")
async def delete_doc(body: DeleteBody, current_user: dict = Depends(login_required)):
    user_id = current_user["user_id"]
    if not body.file:
        raise HTTPException(status_code=400, detail="No filename")

    with get_session() as db:
        doc = db.query(Document).filter(
            Document.user_id == user_id, Document.filename == body.file
        ).first()
        if doc:
            db.delete(doc)

    rag.delete_file(body.file, user_id)
    return {"ok": True}
