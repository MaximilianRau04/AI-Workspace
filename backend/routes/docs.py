import os

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from werkzeug.utils import secure_filename

import rag
from utils import login_required

router = APIRouter(tags=["docs"])

ALLOWED_EXTENSIONS = {".txt", ".md", ".pdf"}


class DeleteBody(BaseModel):
    file: str = ""


@router.get("/docs")
async def list_docs(current_user: dict = Depends(login_required)):
    return {"files": rag.list_indexed()}


@router.post("/docs/upload")
async def upload_doc(
    file: UploadFile = File(...),
    current_user: dict = Depends(login_required),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file")
    filename = secure_filename(file.filename)
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )
    os.makedirs(rag.DOCS_DIR, exist_ok=True)
    content = await file.read()
    with open(os.path.join(rag.DOCS_DIR, filename), "wb") as f:
        f.write(content)
    chunks = rag.index_file(filename)
    return {"file": filename, "chunks": chunks}


@router.post("/docs/delete")
async def delete_doc(body: DeleteBody, current_user: dict = Depends(login_required)):
    if not body.file:
        raise HTTPException(status_code=400, detail="No filename")
    rag.delete_file(body.file)
    path = os.path.join(rag.DOCS_DIR, body.file)
    if os.path.exists(path):
        os.remove(path)
    return {"ok": True}
