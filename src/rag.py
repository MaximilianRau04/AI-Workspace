import os
import json
import math
from google import genai
from google.genai import types

DOCS_DIR   = os.path.join(os.path.dirname(__file__), "..", "docs")
INDEX_FILE = os.path.join(os.path.dirname(__file__), "..", "rag_index.json")
CHUNK_WORDS  = 400
OVERLAP      = 40
TOP_K        = 3
EMBED_MODEL  = "gemini-embedding-001"

_client: genai.Client | None = None


def init(api_key: str) -> None:
    global _client
    _client = genai.Client(api_key=api_key)

# helpers 
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


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na  = math.sqrt(sum(x * x for x in a))
    nb  = math.sqrt(sum(x * x for x in b))
    return dot / (na * nb) if na and nb else 0.0


def _read_file(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        import pypdf
        reader = pypdf.PdfReader(path)
        return "\n".join(p.extract_text() or "" for p in reader.pages)
    with open(path, encoding="utf-8", errors="ignore") as f:
        return f.read()


# index
def _load_index() -> dict:
    if os.path.exists(INDEX_FILE):
        with open(INDEX_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_index(index: dict) -> None:
    with open(INDEX_FILE, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False)


def index_file(filename: str) -> int:
    path   = os.path.join(DOCS_DIR, filename)
    text   = _read_file(path)
    chunks = _chunk(text)
    if not chunks:
        return 0
    embeddings = _embed(chunks)
    index = _load_index()
    index[filename] = [{"text": c, "embedding": e} for c, e in zip(chunks, embeddings)]
    _save_index(index)
    return len(chunks)


def delete_file(filename: str) -> None:
    index = _load_index()
    index.pop(filename, None)
    _save_index(index)


def list_indexed() -> list[str]:
    return list(_load_index().keys())


# retrieval 
def retrieve(query: str, k: int = TOP_K, filename: str | None = None) -> str:
    index = _load_index()
    if not index:
        return ""

    all_chunks = [
        (entry["text"], entry["embedding"], fname)
        for fname, entries in index.items()
        for entry in entries
        if filename is None or fname == filename
    ]
    if not all_chunks:
        return ""

    q_emb  = _embed([query], task="RETRIEVAL_QUERY")[0]
    scored = sorted(all_chunks, key=lambda x: _cosine(q_emb, x[1]), reverse=True)
    top    = scored[:k]

    parts = [f"[{fname}]\n{text}" for text, _, fname in top]
    return "Relevant context from documents:\n\n" + "\n\n---\n\n".join(parts)
