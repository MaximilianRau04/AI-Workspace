"""Word-based chunking in rag.py."""

import rag


def _words(n: int) -> str:
    return " ".join(f"w{i}" for i in range(n))


def test_empty_text_has_no_chunks():
    assert rag._chunk("") == []
    assert rag._chunk("   \n\t ") == []


def test_short_text_is_a_single_chunk():
    assert rag._chunk("hello   world\nfoo") == ["hello world foo"]


def test_chunks_overlap_and_cover_all_words():
    n = rag.CHUNK_WORDS * 2 + 50
    chunks = rag._chunk(_words(n))

    assert all(len(c.split()) <= rag.CHUNK_WORDS for c in chunks)
    first, second = chunks[0].split(), chunks[1].split()
    assert first[-rag.OVERLAP :] == second[: rag.OVERLAP]
    covered = {w for c in chunks for w in c.split()}
    assert covered == set(_words(n).split())
    assert chunks[-1].split()[-1] == f"w{n - 1}"


def test_no_redundant_tail_chunk():
    # A text of exactly CHUNK_WORDS words fits into one chunk; the overlap must not
    # produce a second chunk that only repeats words already in the first one.
    assert len(rag._chunk(_words(rag.CHUNK_WORDS))) == 1
    step = rag.CHUNK_WORDS - rag.OVERLAP
    assert len(rag._chunk(_words(step + rag.CHUNK_WORDS))) == 2
