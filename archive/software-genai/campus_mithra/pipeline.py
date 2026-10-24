"""The Campus Mithra RAG pipeline.

    question -> embed -> cosine similarity over the knowledge base
             -> top 3 passages -> relevance gate -> Gemma -> grounded answer

Three independent guards keep the assistant inside the college knowledge base:

1. **The floor.** If the best passage scores below MIN_SIMILARITY the question
   matched nothing at all, and is refused with no API call.
2. **The off-topic classifier** (`scope.py`). If the question looks more like a
   non-college exemplar than like any college passage, it is refused with no API
   call. This is what stops "what is the weather today" and "tell me a joke".
3. **The prompt contract and output check.** Gemma is given only the retrieved
   passages and the exact refusal sentence; any hedge, apology or empty reply is
   collapsed back into that sentence. This is what catches the topically adjacent
   questions the classifier cannot -- another college's fees, a figure that is simply
   absent from an otherwise relevant document.

No single guard catches everything, which is the point of having three.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from pathlib import Path

from . import config
from .generator import GemmaAnswerer, GemmaUnavailableError
from .knowledge import Chunk
from .retriever import Retriever
from .scope import ScopeGuard

# Phrases that mean the model failed to find the answer. Any of these collapses to
# the single refusal sentence so the hardware always gets one predictable string.
_REFUSAL_PATTERNS = (
    "could not be found in the college knowledge base",
    "not found in the college knowledge base",
    "cannot be found in the college knowledge base",
    "does not contain",
    "doesn't contain",
    "no information",
    "not mentioned in",
    "not specified in",
    "not provided in",
    "i don't have enough information",
    "i do not have enough information",
    "unable to answer",
)

_MARKDOWN = re.compile(r"[*_`#>|]+")


@dataclass
class Answer:
    """One complete turn, carrying everything the UI and the ESP32 both need."""

    question: str
    answer: str
    grounded: bool
    refused: bool
    sources: list[str] = field(default_factory=list)
    scores: list[float] = field(default_factory=list)
    passages: list[Chunk] = field(default_factory=list)
    top_score: float = 0.0
    off_topic_score: float = 0.0
    blocked_by: str | None = None   # "floor", "off_topic", "model", "api"
    latency_ms: int = 0
    error: str | None = None

    def speech_text(self) -> str:
        """Answer trimmed to a length that is sensible to speak aloud."""
        text = self.answer
        if len(text) <= config.SPEECH_MAX_CHARS:
            return text
        cut = text[: config.SPEECH_MAX_CHARS]
        stop = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
        return (cut[: stop + 1] if stop > 120 else cut).strip()

    def to_dict(self) -> dict[str, object]:
        return {
            "question": self.question,
            "answer": self.answer,
            "speech": self.speech_text(),
            "grounded": self.grounded,
            "refused": self.refused,
            "sources": self.sources,
            "scores": [round(s, 4) for s in self.scores],
            "top_score": round(self.top_score, 4),
            "off_topic_score": round(self.off_topic_score, 4),
            "blocked_by": self.blocked_by,
            "latency_ms": self.latency_ms,
            "error": self.error,
        }


def clean_answer(text: str) -> str:
    """Strip Markdown and collapse whitespace so the text is speakable."""
    text = _MARKDOWN.sub("", text or "")
    text = re.sub(r"^\s*[-+]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"\s*\n\s*", " ", text)
    return re.sub(r"\s{2,}", " ", text).strip()


def looks_like_refusal(text: str) -> bool:
    low = (text or "").lower()
    return any(pattern in low for pattern in _REFUSAL_PATTERNS)


class CampusMithra:
    """The assistant. Build it once, then call ask() per question."""

    def __init__(
        self,
        retriever: Retriever | None = None,
        answerer: GemmaAnswerer | None = None,
    ) -> None:
        self.retriever = retriever or Retriever.build()
        self.answerer = answerer or GemmaAnswerer()
        self.scope = ScopeGuard(self.retriever.encode)

    @classmethod
    def load(cls, kb_dir: Path | None = None, verbose: bool = True) -> "CampusMithra":
        return cls(retriever=Retriever.build(kb_dir=kb_dir, verbose=verbose))

    # ------------------------------------------------------------------ #
    # Main entry point
    # ------------------------------------------------------------------ #

    def ask(self, question: str, top_k: int | None = None) -> Answer:
        started = time.perf_counter()
        question = (question or "").strip()

        def elapsed() -> int:
            return int((time.perf_counter() - started) * 1000)

        if len(question) < 3:
            return Answer(
                question=question,
                answer="Please ask a question about the college.",
                grounded=False,
                refused=True,
                blocked_by="floor",
                latency_ms=elapsed(),
            )

        passages = self.retriever.search(question, top_k=top_k)
        scores = [p.score for p in passages]
        top_score = max(scores) if scores else 0.0
        sources = [p.citation() for p in passages]

        def refuse(blocked_by: str, off_topic: float = 0.0, error: str | None = None) -> Answer:
            # An outage is not the same as a fact being absent, and must not be
            # reported as one.
            message = (config.SERVICE_ERROR_MESSAGE if blocked_by == "api"
                       else config.REFUSAL_MESSAGE)
            return Answer(
                question=question,
                answer=message,
                grounded=False,
                refused=True,
                sources=sources,
                scores=scores,
                passages=passages,
                top_score=top_score,
                off_topic_score=off_topic,
                blocked_by=blocked_by,
                latency_ms=elapsed(),
                error=error,
            )

        # Guard 1: the floor. Nothing in the knowledge base matched at all.
        if not passages or top_score < config.MIN_SIMILARITY:
            return refuse("floor")

        # Guard 2: the off-topic classifier. No API call for unrelated questions.
        in_scope, off_topic, _exemplar = self.scope.check(question, top_score)
        if not in_scope:
            return refuse("off_topic", off_topic)

        try:
            raw = self.answerer.generate(question, passages)
        except GemmaUnavailableError as exc:
            return refuse("api", off_topic, str(exc))

        answer = clean_answer(raw)

        # Guard 3b: output check. An empty or hedging reply becomes the refusal.
        if not answer or looks_like_refusal(answer):
            return refuse("model", off_topic)

        return Answer(
            question=question,
            answer=answer,
            grounded=True,
            refused=False,
            sources=sources,
            scores=scores,
            passages=passages,
            top_score=top_score,
            off_topic_score=off_topic,
            latency_ms=elapsed(),
        )

    # ------------------------------------------------------------------ #
    # Diagnostics
    # ------------------------------------------------------------------ #

    def retrieve_only(self, question: str, top_k: int | None = None) -> list[Chunk]:
        """Retrieval without Gemma, for tuning MIN_SIMILARITY offline."""
        return self.retriever.search(question, top_k=top_k)

    def scope_report(self, question: str) -> dict[str, object]:
        """Both guard scores for one question, with no API call. Use this to tune."""
        passages = self.retriever.search(question)
        kb_score = passages[0].score if passages else 0.0
        in_scope, off_topic, exemplar = self.scope.check(question, kb_score)
        return {
            "question": question,
            "kb_score": round(kb_score, 4),
            "best_passage": passages[0].citation() if passages else None,
            "off_topic_score": round(off_topic, 4),
            "closest_off_topic_exemplar": exemplar,
            "passes_floor": kb_score >= config.MIN_SIMILARITY,
            "passes_off_topic_guard": in_scope,
            "would_reach_gemma": kb_score >= config.MIN_SIMILARITY and in_scope,
        }

    def info(self) -> dict[str, object]:
        data = config.summary()
        data.update(self.retriever.stats())
        return data
