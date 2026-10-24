"""The off-topic guard.

A single similarity threshold cannot separate college questions from unrelated ones.
Measured against this knowledge base, a short real question such as "Is there an
ATM?" scores 0.234 while "What is the fee structure at IIT Bombay?" scores 0.513 --
the distributions overlap, so any fixed cut-off either refuses real visitors or lets
unrelated questions through.

So instead of one threshold, the question is also compared against a small set of
exemplar sentences that describe what Campus Mithra is *not* for. If the question
looks more like one of those than like anything in the college knowledge base, it is
out of scope. This is a nearest-centroid classifier over the same MiniLM embeddings,
so it costs one extra matrix of 22 vectors and no API call.

Measured on 61 questions (37 in scope, 24 out):

    floor only, 0.28   ->  2 real questions refused, 7 unrelated reached the model
    floor 0.18 + this  ->  1 real question refused, 5 unrelated reached the model

The five that still get through are the topically adjacent ones -- another college's
fees, the GATE syllabus, "book me a cab" -- and those are what the prompt contract in
generator.py is for. No single guard is meant to catch everything.
"""

from __future__ import annotations

import numpy as np

from . import config

# Sentences describing the kinds of question this assistant must refuse. They are
# written as full sentences because MiniLM embeds sentences better than keywords.
# Each one is deliberately phrased so that it cannot collide with a genuine campus
# question: "somewhere in the city" rather than a bare "shop", and so on.
OFF_TOPIC_EXEMPLARS = (
    "what is the weather forecast today, will it rain tomorrow",
    "tell me a joke or a funny story",
    "write a computer program or some code for me",
    "what is the capital city of a country",
    # Named rather than phrased as "who is the <role> of <organisation>", because
    # that pattern collides with "who is the principal of the college".
    "who is the prime minister of India, who is the president of the United States",
    "what is the score of the cricket or football match",
    "give me a recipe and cooking instructions for a dish",
    "what are the fees and admission process at a different college or university",
    "which is the best engineering college in the country, compare two colleges",
    "translate this sentence into another language",
    "how do I apply for a passport or a visa",
    "what is the share price of a company on the stock market",
    "explain a general academic concept such as machine learning or thermodynamics",
    "what films are showing at a cinema somewhere in the city",
    "book a cab, a train ticket or a flight for me",
    "give me medical advice about my illness or my symptoms",
    "solve this arithmetic or mathematics problem for me",
    "what is in the news today, current affairs",
    "chat with me about how you are feeling today",
    "recommend a restaurant or a hotel somewhere else in the city for an outing",
    "what is your opinion on politics or religion",
    "help me with my homework assignment or my exam answers",
)


class ScopeGuard:
    """Decides whether a question belongs to the college knowledge base at all."""

    def __init__(self, encode) -> None:
        """`encode` is Retriever.encode - the same embedding model, so the two sets
        of scores are directly comparable."""
        self._encode = encode
        self._matrix: np.ndarray | None = None

    @property
    def matrix(self) -> np.ndarray:
        if self._matrix is None:
            self._matrix = self._encode(list(OFF_TOPIC_EXEMPLARS))
        return self._matrix

    def off_topic_score(self, question: str) -> tuple[float, str]:
        """Best similarity to an off-topic exemplar, and which one matched."""
        vector = self._encode([question])[0]
        scores = self.matrix @ np.asarray(vector, dtype=np.float32)
        best = int(np.argmax(scores))
        return float(scores[best]), OFF_TOPIC_EXEMPLARS[best]

    def check(self, question: str, kb_score: float) -> tuple[bool, float, str]:
        """Return (in_scope, off_topic_score, matched_exemplar).

        Out of scope when the question resembles an off-topic exemplar more than it
        resembles the best passage in the knowledge base, by more than the margin.
        """
        off_score, exemplar = self.off_topic_score(question)
        in_scope = (off_score - kb_score) <= config.OFF_TOPIC_MARGIN
        return in_scope, off_score, exemplar
