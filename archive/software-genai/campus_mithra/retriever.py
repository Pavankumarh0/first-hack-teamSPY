"""Embedding and retrieval.

Chunks are embedded once with sentence-transformers/all-MiniLM-L6-v2 and cached on
disk. Retrieval is plain cosine similarity: because MiniLM embeddings are L2
normalised, the cosine score is just a dot product, so the whole search is one
matrix-vector multiply and is fast enough to run on the laptop that drives the ESP32.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from . import config
from .knowledge import Chunk, build_chunks, fingerprint


class Retriever:
    """Holds the chunk list and its embedding matrix."""

    def __init__(self, chunks: list[Chunk], matrix: np.ndarray) -> None:
        self.chunks = chunks
        self.matrix = matrix
        self._model = None

    # ------------------------------------------------------------------ #
    # Construction
    # ------------------------------------------------------------------ #

    @classmethod
    def build(
        cls,
        kb_dir: Path | None = None,
        use_cache: bool = True,
        verbose: bool = True,
    ) -> "Retriever":
        chunks = build_chunks(kb_dir)
        if verbose:
            docs = len({c.source for c in chunks})
            print(f"[kb] {len(chunks)} chunks from {docs} documents")

        key = fingerprint(chunks)
        cache_npy = config.CACHE_DIR / "embeddings.npy"
        cache_meta = config.CACHE_DIR / "embeddings.json"

        if use_cache and cache_npy.exists() and cache_meta.exists():
            try:
                meta = json.loads(cache_meta.read_text(encoding="utf-8"))
                if meta.get("fingerprint") == key:
                    matrix = np.load(cache_npy)
                    if matrix.shape[0] == len(chunks):
                        if verbose:
                            print(f"[kb] loaded cached embeddings {matrix.shape}")
                        return cls(chunks, matrix)
            except (OSError, ValueError, json.JSONDecodeError):
                pass  # fall through and re-embed

        retriever = cls(chunks, np.zeros((0, 0), dtype=np.float32))
        if verbose:
            print(f"[kb] embedding {len(chunks)} chunks with {config.EMBEDDING_MODEL} ...")
        matrix = retriever.encode([c.text for c in chunks], verbose=verbose)
        retriever.matrix = matrix

        if use_cache:
            config.CACHE_DIR.mkdir(parents=True, exist_ok=True)
            np.save(cache_npy, matrix)
            cache_meta.write_text(
                json.dumps(
                    {
                        "fingerprint": key,
                        "chunks": len(chunks),
                        "dim": int(matrix.shape[1]),
                        "embedding_model": config.EMBEDDING_MODEL,
                        "chunk_size": config.CHUNK_SIZE,
                        "chunk_overlap": config.CHUNK_OVERLAP,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
            if verbose:
                print(f"[kb] cached embeddings at {cache_npy}")
        return retriever

    # ------------------------------------------------------------------ #
    # Embedding
    # ------------------------------------------------------------------ #

    @property
    def model(self):
        """Lazily loaded SentenceTransformer (first call downloads ~90 MB)."""
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            self._model = SentenceTransformer(config.EMBEDDING_MODEL)
        return self._model

    def encode(self, texts: list[str], verbose: bool = False) -> np.ndarray:
        vectors = self.model.encode(
            texts,
            batch_size=32,
            convert_to_numpy=True,
            normalize_embeddings=True,     # makes cosine similarity a dot product
            show_progress_bar=verbose and len(texts) > 16,
        )
        return np.asarray(vectors, dtype=np.float32)

    # ------------------------------------------------------------------ #
    # Search
    # ------------------------------------------------------------------ #

    @staticmethod
    def cosine_similarity(query: np.ndarray, matrix: np.ndarray) -> np.ndarray:
        """Cosine similarity of one query vector against every row of matrix."""
        query = np.asarray(query, dtype=np.float32).reshape(-1)
        qn = float(np.linalg.norm(query))
        if qn == 0.0:
            return np.zeros(matrix.shape[0], dtype=np.float32)
        norms = np.linalg.norm(matrix, axis=1)
        norms[norms == 0.0] = 1e-12
        return (matrix @ query) / (norms * qn)

    def search(self, question: str, top_k: int | None = None) -> list[Chunk]:
        """Return the top_k most similar chunks, highest score first."""
        top_k = top_k or config.TOP_K
        question = (question or "").strip()
        if not question or self.matrix.size == 0:
            return []

        query_vector = self.encode([question])[0]
        scores = self.cosine_similarity(query_vector, self.matrix)

        k = min(top_k, len(scores))
        best = np.argpartition(-scores, k - 1)[:k]
        best = best[np.argsort(-scores[best])]

        results: list[Chunk] = []
        for position in best:
            chunk = self.chunks[int(position)]
            hit = Chunk(
                text=chunk.text,
                body=chunk.body,
                source=chunk.source,
                section=chunk.section,
                title=chunk.title,
                index=chunk.index,
                score=float(scores[int(position)]),
            )
            results.append(hit)
        return results

    # ------------------------------------------------------------------ #
    # Info
    # ------------------------------------------------------------------ #

    def stats(self) -> dict[str, object]:
        return {
            "chunks": len(self.chunks),
            "documents": sorted({c.source for c in self.chunks}),
            "dimension": int(self.matrix.shape[1]) if self.matrix.size else 0,
        }
