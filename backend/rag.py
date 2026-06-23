import io
import os
import chromadb
from google import genai
from google.genai import types

CHROMA_DIR = os.path.join(os.path.dirname(__file__), "..", "chroma_db")
CHUNK_WORDS = 400
OVERLAP = 40
TOP_K = 3
EMBED_MODEL = "gemini-embedding-001"
COLLECTION = "documents"

_client: genai.Client | None = None
_chroma: chromadb.Collection | None = None


def init(api_key: str) -> None:
    global _client, _chroma
    _client = genai.Client(api_key=api_key)
    db = chromadb.PersistentClient(path=CHROMA_DIR)
    _chroma = db.get_or_create_collection(COLLECTION)


def extract_text(content: bytes, filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    if ext == ".pdf":
        import pypdf

        reader = pypdf.PdfReader(io.BytesIO(content))
        return "\n".join(p.extract_text() or "" for p in reader.pages)
    return content.decode("utf-8", errors="ignore")


def _chunk(text: str) -> list[str]:
    words = text.split()
    chunks, i = [], 0
    while i < len(words):
        chunks.append(" ".join(words[i : i + CHUNK_WORDS]))
        i += CHUNK_WORDS - OVERLAP
    return [c for c in chunks if c.strip()]


def _embed(texts: list[str], task: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
    r = _client.models.embed_content(
        model=EMBED_MODEL,
        contents=texts,
        config=types.EmbedContentConfig(task_type=task),
    )
    return [e.values for e in r.embeddings]


def _where_user(user_id: str) -> dict:
    return {"user_id": user_id}


def _where_user_file(user_id: str, filename: str) -> dict:
    return {"$and": [{"user_id": user_id}, {"source": filename}]}


def _delete_chunks(user_id: str, filename: str) -> None:
    existing = _chroma.get(where=_where_user_file(user_id, filename), include=[])
    if existing["ids"]:
        _chroma.delete(where=_where_user_file(user_id, filename))


def index_file(filename: str, user_id: str, content: str) -> int:
    chunks = _chunk(content)
    if not chunks:
        return 0

    _delete_chunks(user_id, filename)

    embeddings = _embed(chunks)
    ids = [f"{user_id}::{filename}::{i}" for i in range(len(chunks))]
    metadatas = [{"source": filename, "user_id": user_id} for _ in chunks]

    _chroma.add(ids=ids, embeddings=embeddings, documents=chunks, metadatas=metadatas)
    return len(chunks)


def delete_file(filename: str, user_id: str) -> None:
    _delete_chunks(user_id, filename)


def list_indexed(user_id: str) -> list[str]:
    result = _chroma.get(where=_where_user(user_id), include=["metadatas"])
    seen: set[str] = set()
    files: list[str] = []
    for meta in result["metadatas"]:
        src = meta.get("source", "")
        if src and src not in seen:
            seen.add(src)
            files.append(src)
    return files


def retrieve(query: str, user_id: str, k: int = TOP_K, filename: str | None = None) -> str:
    if _chroma is None or _chroma.count() == 0:
        return ""

    where = _where_user_file(user_id, filename) if filename else _where_user(user_id)
    matching = _chroma.get(where=where, include=[])
    n = min(k, len(matching["ids"]))
    if n == 0:
        return ""

    q_emb = _embed([query], task="RETRIEVAL_QUERY")[0]
    results = _chroma.query(
        query_embeddings=[q_emb],
        n_results=n,
        where=where,
        include=["documents", "metadatas"],
    )

    docs = results["documents"][0]
    metas = results["metadatas"][0]
    if not docs:
        return ""

    parts = [f"[{m['source']}]\n{d}" for d, m in zip(docs, metas)]
    return "Relevant context from documents:\n\n" + "\n\n---\n\n".join(parts)
