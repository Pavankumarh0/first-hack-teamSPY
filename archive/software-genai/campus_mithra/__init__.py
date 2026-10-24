"""Campus Mithra - an AI campus assistant grounded in one college knowledge base."""

from .config import ASSISTANT_NAME, COLLEGE_NAME, REFUSAL_MESSAGE
from .generator import GemmaAnswerer, GemmaUnavailableError
from .knowledge import Chunk, build_chunks
from .pipeline import Answer, CampusMithra
from .retriever import Retriever
from .scope import ScopeGuard

__version__ = "1.0.0"

__all__ = [
    "ASSISTANT_NAME",
    "COLLEGE_NAME",
    "REFUSAL_MESSAGE",
    "Answer",
    "CampusMithra",
    "Chunk",
    "GemmaAnswerer",
    "GemmaUnavailableError",
    "Retriever",
    "ScopeGuard",
    "build_chunks",
    "__version__",
]
