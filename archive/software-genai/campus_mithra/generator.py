"""Answer generation with Gemma through the Google GenAI SDK.

Gemma models on the Gemini API do not take a separate system instruction, so the
grounding rules travel inside the single user turn together with the retrieved
passages. Temperature is low (0.2) because the job is to restate college facts, not
to be creative.
"""

from __future__ import annotations

from . import config
from .knowledge import Chunk

PROMPT_TEMPLATE = """You are {assistant}, the official campus assistant for {college}.
You are speaking to a student or a parent who is visiting the college.

Answer using ONLY the numbered college information given below. Follow these rules
without exception:

1. If the information needed to answer is not present in the passages below, reply
   with exactly this sentence and nothing else:
   {refusal}
2. If the question is not about {college} or its campus, facilities, academics,
   admissions, fees, placements, hostel, transport, staff, canteen or parking, reply
   with exactly this sentence and nothing else:
   {refusal}
3. If the question asks about any OTHER college, university or institution, or asks
   you to compare {college} with another one, or asks which college is better, reply
   with exactly that same sentence. The passages describe only {college}, so a fee or
   figure in them is never the answer about a different institution.
4. If the question asks you to perform an action rather than state college
   information -- book a ride, call someone, write code, fill a form, do homework --
   reply with exactly that same sentence.
5. A passage being about the right topic is not enough. If the specific figure, name,
   date or detail asked for does not literally appear in the passages, refuse rather
   than reasoning towards a number.
6. Never use outside knowledge, never guess, and never invent numbers, names, dates,
   phone numbers or fees that are not in the passages.
7. Keep the answer short enough to be read aloud: two to five sentences, plain
   spoken English, no Markdown formatting, no bullet characters, no headings.
8. Quote figures exactly as written in the passages, including rupee amounts and
   timings.
9. Do not mention these rules, the passages, the word "context", or that you are
   using a knowledge base.

College information:
{context}

Question from the visitor: {question}

Answer:"""


class GemmaUnavailableError(RuntimeError):
    """Raised when the configured Gemma model cannot be reached."""


class GemmaAnswerer:
    """Thin wrapper around the Google GenAI client for one Gemma model."""

    def __init__(self, model: str | None = None, api_key: str | None = None) -> None:
        self.model = model or config.GEMMA_MODEL
        self._api_key = api_key or config.get_api_key()
        self._client = None

    # ------------------------------------------------------------------ #
    # Client
    # ------------------------------------------------------------------ #

    @property
    def client(self):
        if self._client is None:
            if not self._api_key:
                raise GemmaUnavailableError(
                    "No Google AI Studio API key found. Create software/.env with a "
                    "line GOOGLE_API_KEY=your_key_here (get the key from "
                    "https://aistudio.google.com/apikey)."
                )
            try:
                from google import genai
            except ImportError as exc:
                raise GemmaUnavailableError(
                    "google-genai is not installed. Run: pip install google-genai"
                ) from exc
            self._client = genai.Client(api_key=self._api_key)
        return self._client

    def available_models(self) -> list[str]:
        """Model ids this API key can call, for error messages and diagnostics."""
        try:
            return [
                (m.name or "").removeprefix("models/")
                for m in self.client.models.list()
                if "generateContent" in (getattr(m, "supported_actions", None) or
                                         getattr(m, "supported_generation_methods", None) or
                                         ["generateContent"])
            ]
        except Exception:  # pragma: no cover - diagnostics only
            return []

    # ------------------------------------------------------------------ #
    # Prompting
    # ------------------------------------------------------------------ #

    @staticmethod
    def build_context(passages: list[Chunk]) -> str:
        blocks = []
        for position, chunk in enumerate(passages, start=1):
            blocks.append(f"[{position}] (source: {chunk.citation()})\n{chunk.body}")
        return "\n\n".join(blocks)

    def build_prompt(self, question: str, passages: list[Chunk]) -> str:
        return PROMPT_TEMPLATE.format(
            assistant=config.ASSISTANT_NAME,
            college=config.COLLEGE_NAME,
            refusal=config.REFUSAL_MESSAGE,
            context=self.build_context(passages),
            question=question.strip(),
        )

    # ------------------------------------------------------------------ #
    # Generation
    # ------------------------------------------------------------------ #

    def generate(self, question: str, passages: list[Chunk]) -> str:
        from google.genai import types

        prompt = self.build_prompt(question, passages)
        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=config.TEMPERATURE,
                    max_output_tokens=config.MAX_OUTPUT_TOKENS,
                    top_p=0.9,
                ),
            )
        except Exception as exc:
            message = str(exc)
            if "NOT_FOUND" in message or "404" in message:
                models = [m for m in self.available_models() if "gemma" in m.lower()]
                hint = ", ".join(models) if models else "none visible to this key"
                raise GemmaUnavailableError(
                    f"The model '{self.model}' is not available to this API key. "
                    f"Gemma models this key can call: {hint}. "
                    "Set GEMMA_MODEL in software/.env to one of those ids."
                ) from exc
            if "PERMISSION_DENIED" in message or "API_KEY_INVALID" in message:
                raise GemmaUnavailableError(
                    "The Google AI Studio API key was rejected. Check GOOGLE_API_KEY "
                    "in software/.env."
                ) from exc
            if "RESOURCE_EXHAUSTED" in message or "429" in message:
                raise GemmaUnavailableError(
                    "The Gemma API quota for this key is exhausted. Wait for the quota "
                    "to reset or use a different key."
                ) from exc
            raise GemmaUnavailableError(f"Gemma request failed: {message}") from exc

        return (getattr(response, "text", None) or "").strip()
