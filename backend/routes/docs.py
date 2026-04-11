import os

from flask import Blueprint, jsonify, request
from werkzeug.utils import secure_filename

import rag
from utils import login_required

bp = Blueprint("docs", __name__)

ALLOWED_EXTENSIONS = {".txt", ".md", ".pdf"}


@bp.route("/docs", methods=["GET"])
@login_required
def list_docs():
    return jsonify({"files": rag.list_indexed()})


@bp.route("/docs/upload", methods=["POST"])
@login_required
def upload_doc():
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file"}), 400
    filename = secure_filename(file.filename)
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({"error": f"Unsupported type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"}), 400
    os.makedirs(rag.DOCS_DIR, exist_ok=True)
    file.save(os.path.join(rag.DOCS_DIR, filename))
    chunks = rag.index_file(filename)
    return jsonify({"file": filename, "chunks": chunks})


@bp.route("/docs/delete", methods=["POST"])
@login_required
def delete_doc():
    filename = request.get_json().get("file")
    if not filename:
        return jsonify({"error": "No filename"}), 400
    rag.delete_file(filename)
    path = os.path.join(rag.DOCS_DIR, filename)
    if os.path.exists(path):
        os.remove(path)
    return jsonify({"ok": True})
