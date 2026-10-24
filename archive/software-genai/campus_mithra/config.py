"""Central configuration for Campus Mithra.

Secrets come from a local .env file (never committed) or from real environment
variables. The loader below is deliberately dependency-free so the project works
even before python-dotenv is installed.
"""

from __future__ import annotations

import os
from pathlib import Path

# --------------------------------------------------------------------------- #
# Paths
# --------------------------------------------------------------------------- #

SOFTWARE_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = SOFTWARE_DIR.parent
KNOWLEDGE_BASE_DIR = SOFTWARE_DIR / "knowledge_base"
CACHE_DIR = SOFTWARE_DIR / ".cache"
ENV_FILE = SOFTWARE_DIR / ".env"


# --------------------------------------------------------------------------- #
# .env loading
# --------------------------------------------------------------------------- #

def load_env(path: Path = ENV_FILE) -> None:
    """Load KEY=VALUE pairs from .env without overwriting real env vars."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_env()


def _env(name: str, default: str) -> str:
    value = os.environ.get(name)
    return value if value not in (None, "") else default


def _env_float(name: str, default: float) -> float:
    try:
        return float(_env(name, str(default)))
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(_env(name, str(default)))
    except ValueError:
        return default


# --------------------------------------------------------------------------- #
# API key
# --------------------------------------------------------------------------- #

API_KEY_VARS = ("GOOGLE_API_KEY", "GEMINI_API_KEY", "GOOGLE_AI_STUDIO_API_KEY")


def get_api_key() -> str | None:
    """Return the first Google AI Studio key found in the environment."""
    for var in API_KEY_VARS:
        value = os.environ.get(var)
        if value:
            return value.strip()
    return None


# --------------------------------------------------------------------------- #
# Model and RAG parameters
# --------------------------------------------------------------------------- #

# The Gemma model served through the Google GenAI SDK. Override in .env if your
# API key is enabled for a different Gemma revision.
GEMMA_MODEL = _env("GEMMA_MODEL", "gemma-4-26b-a4b-it")

EMBEDDING_MODEL = _env("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")

CHUNK_SIZE = _env_int("CHUNK_SIZE", 120)        # words per chunk
CHUNK_OVERLAP = _env_int("CHUNK_OVERLAP", 30)   # words shared between chunks
TOP_K = _env_int("TOP_K", 3)                    # passages handed to Gemma
TEMPERATURE = _env_float("TEMPERATURE", 0.2)
MAX_OUTPUT_TOKENS = _env_int("MAX_OUTPUT_TOKENS", 512)

# Guard 1, the floor: a question whose best passage scores below this cosine
# similarity matched nothing at all and is refused without spending an API call.
# Measured on this knowledge base, genuine short questions bottom out around 0.23,
# so the floor sits below that and the work of judging scope is left to guard 2.
MIN_SIMILARITY = _env_float("MIN_SIMILARITY", 0.18)

# Guard 2, the off-topic classifier (see scope.py): refuse when the question
# resembles a non-college exemplar more than the best college passage, by more than
# this margin. Raise it to let more borderline questions through to Gemma.
# A small positive margin biases the guard towards letting a question through: a
# near-tie goes to Gemma, where the prompt contract decides. Refusing a real visitor
# is the worse failure, and guard 3 still stands behind this one.
OFF_TOPIC_MARGIN = _env_float("OFF_TOPIC_MARGIN", 0.03)

# Answers are capped for the 2.8 inch TFT and for spoken playback.
SPEECH_MAX_CHARS = _env_int("SPEECH_MAX_CHARS", 600)

# --------------------------------------------------------------------------- #
# Fixed strings
# --------------------------------------------------------------------------- #

COLLEGE_NAME = _env("COLLEGE_NAME", "Sri Venkateshwara Institute of Technology (SVIT)")

# The exact sentence returned whenever the knowledge base cannot answer.
REFUSAL_MESSAGE = "The answer could not be found in the college knowledge base."

# Said instead when the assistant itself is broken -- no API key, quota exhausted,
# network down. Claiming the answer is absent from the knowledge base would be a lie
# in that case, and would hide a real outage from whoever runs the kiosk.
SERVICE_ERROR_MESSAGE = (
    "The assistant is not able to answer right now. "
    "Please ask at the admission desk."
)

ASSISTANT_NAME = "Campus Mithra"


def summary() -> dict[str, object]:
    """Config snapshot used by the setup checker and the Gradio sidebar."""
    return {
        "college": COLLEGE_NAME,
        "gemma_model": GEMMA_MODEL,
        "embedding_model": EMBEDDING_MODEL,
        "chunk_size": CHUNK_SIZE,
        "chunk_overlap": CHUNK_OVERLAP,
        "top_k": TOP_K,
        "temperature": TEMPERATURE,
        "min_similarity": MIN_SIMILARITY,
        "off_topic_margin": OFF_TOPIC_MARGIN,
        "knowledge_base_dir": str(KNOWLEDGE_BASE_DIR),
        "api_key_present": get_api_key() is not None,
    }
