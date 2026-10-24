"""Knowledge base loading and chunking.

Documents live in software/knowledge_base as .md, .txt or .pdf files. Each file is
split into overlapping word windows of CHUNK_SIZE words with CHUNK_OVERLAP words of
overlap, so a fact that straddles a window boundary still appears whole in one chunk.

Every chunk keeps the document title and the nearest Markdown heading as a prefix.
That prefix is what makes a short chunk such as a fee table row retrievable by a
question like "what is the hostel fee" even when the row itself never says "hostel".
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from . import config

SUPPORTED_SUFFIXES = {".md", ".txt", ".pdf"}


@dataclass
class Chunk:
    """One retrievable passage of the knowledge base."""

    text: str                 # embedded and shown to Gemma (includes the prefix)
    body: str                 # the passage without the heading prefix
    source: str               # file name the passage came from
    section: str              # nearest Markdown heading
    title: str                # document H1 title
    index: int = 0            # position in the global chunk list
    score: float = 0.0        # filled in by the retriever
    meta: dict = field(default_factory=dict)

    def citation(self) -> str:
        if self.section and self.section != self.title:
            return f"{self.source} > {self.section}"
        return self.source


# --------------------------------------------------------------------------- #
# Reading files
# --------------------------------------------------------------------------- #

def _read_pdf(path: Path) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:  # pragma: no cover - dependency guard
        raise RuntimeError(
            f"{path.name} is a PDF but pypdf is not installed. "
            "Run: pip install pypdf"
        ) from exc

    reader = PdfReader(str(path))
    pages = [(page.extract_text() or "") for page in reader.pages]
    return "\n\n".join(pages)


def read_document(path: Path) -> str:
    if path.suffix.lower() == ".pdf":
        return _read_pdf(path)
    return path.read_text(encoding="utf-8", errors="replace")


def list_documents(kb_dir: Path | None = None) -> list[Path]:
    kb_dir = kb_dir or config.KNOWLEDGE_BASE_DIR
    if not kb_dir.exists():
        raise FileNotFoundError(f"Knowledge base directory not found: {kb_dir}")
    files = [
        p for p in sorted(kb_dir.rglob("*"))
        if p.is_file() and p.suffix.lower() in SUPPORTED_SUFFIXES
    ]
    if not files:
        raise FileNotFoundError(f"No .md, .txt or .pdf files found in {kb_dir}")
    return files


# --------------------------------------------------------------------------- #
# Splitting
# --------------------------------------------------------------------------- #

_HEADING = re.compile(r"^(#{1,6})\s+(.*)$")


def _sections(text: str) -> list[tuple[str, str, str]]:
    """Split a document into (title, heading, body) sections by Markdown heading."""
    title = ""
    heading = ""
    buffer: list[str] = []
    out: list[tuple[str, str, str]] = []

    def flush() -> None:
        body = "\n".join(buffer).strip()
        if body:
            out.append((title, heading or title, body))
        buffer.clear()

    for line in text.splitlines():
        match = _HEADING.match(line.strip())
        if match:
            flush()
            level, label = len(match.group(1)), match.group(2).strip()
            if level == 1 and not title:
                title = label
                heading = label
            else:
                heading = label
            continue
        buffer.append(line)

    flush()
    if not out:
        stripped = text.strip()
        if stripped:
            out.append((title, heading or title, stripped))
    return out


def _normalise(text: str) -> str:
    """Collapse whitespace but keep table pipes and list markers readable."""
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text.splitlines()]
    return "\n".join(ln for ln in lines if ln)


def split_words(words: list[str], size: int, overlap: int) -> list[list[str]]:
    """Sliding window over a word list."""
    if size <= 0:
        raise ValueError("CHUNK_SIZE must be positive")
    if overlap >= size:
        raise ValueError("CHUNK_OVERLAP must be smaller than CHUNK_SIZE")
    if not words:
        return []

    step = size - overlap
    windows: list[list[str]] = []
    start = 0
    while start < len(words):
        windows.append(words[start:start + size])
        if start + size >= len(words):
            break
        start += step
    return windows


def build_chunks(
    kb_dir: Path | None = None,
    chunk_size: int | None = None,
    chunk_overlap: int | None = None,
) -> list[Chunk]:
    """Load every knowledge base document and return the full chunk list."""
    chunk_size = chunk_size or config.CHUNK_SIZE
    chunk_overlap = chunk_overlap if chunk_overlap is not None else config.CHUNK_OVERLAP

    chunks: list[Chunk] = []
    for path in list_documents(kb_dir):
        raw = read_document(path)
        for title, heading, body in _sections(raw):
            body = _normalise(body)
            if not body:
                continue
            label = f"{title} - {heading}" if title and heading != title else (heading or title)
            for window in split_words(body.split(), chunk_size, chunk_overlap):
                passage = " ".join(window)
                chunks.append(
                    Chunk(
                        text=f"{label}\n{passage}" if label else passage,
                        body=passage,
                        source=path.name,
                        section=heading,
                        title=title or path.stem,
                    )
                )

    for position, chunk in enumerate(chunks):
        chunk.index = position
    return chunks


def fingerprint(chunks: list[Chunk]) -> str:
    """Stable hash of the chunk set, used to invalidate the embedding cache."""
    import hashlib

    digest = hashlib.sha256()
    digest.update(config.EMBEDDING_MODEL.encode("utf-8"))
    digest.update(f"{config.CHUNK_SIZE}:{config.CHUNK_OVERLAP}".encode("utf-8"))
    for chunk in chunks:
        digest.update(chunk.text.encode("utf-8"))
    return digest.hexdigest()
