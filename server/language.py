"""Kannada, Hindi and English at the kiosk, including Kanglish and Hinglish.

The answering pipeline (retrieval, Gemma, the grounding check, sources) stays
English: the knowledge base and the campus records are English, and grounding
compares the answer with them word for word. This module wraps it:

    question (any of the three, mixed or not)
        -> understand(): detected language, English for the pipeline, and a
           Latin-script copy for the kiosk TFT (its fonts are ASCII only)
    English answer
        -> localize(): the answer in the visitor's language, code-mixed the way
           people on campus speak (English place names and words stay English),
           plus its Latin-script copy for the TFT

Translation is Sarvam's (api.sarvam.ai, the same key as speech-to-text). When
it fails, the visitor gets the English answer rather than no answer.
"""
import asyncio
import logging
import os
import re
from collections import OrderedDict

import httpx

log = logging.getLogger("language")

SARVAM = "https://api.sarvam.ai"

# Reply languages: code -> Sarvam language code and edge-tts voice.
LANGUAGES = {
    "en": {"code": "en-IN", "voice": lambda: os.getenv("TTS_VOICE", "en-IN-NeerjaNeural")},
    "kn": {"code": "kn-IN", "voice": lambda: os.getenv("TTS_VOICE_KN", "kn-IN-SapnaNeural")},
    "hi": {"code": "hi-IN", "voice": lambda: os.getenv("TTS_VOICE_HI", "hi-IN-SwaraNeural")},
}

# Spoken after an answer: "This is from the hostel information." The source
# name (hostel, canteen and food...) stays English, as people say it.
SOURCE_SUFFIX = {
    "en": " This is from the {src} information.",
    "kn": " ಈ ಮಾಹಿತಿ {src} ವಿಭಾಗದಿಂದ ಬಂದಿದೆ.",
    "hi": " यह जानकारी {src} से ली गई है।",
}


def enabled() -> list[str]:
    """KIOSK_LANGUAGES=en,kn,hi (the default); English is always on."""
    raw = os.getenv("KIOSK_LANGUAGES", "en,kn,hi")
    langs = [x.strip() for x in raw.split(",") if x.strip() in LANGUAGES]
    return ["en"] + [x for x in langs if x != "en"]


def reply_language(sarvam_code: str | None) -> str:
    """'kn-IN' -> 'kn'. Anything not enabled (Tamil, an unknown result...) is
    answered in English, though the question is still translated."""
    short = (sarvam_code or "").split("-")[0].lower()
    return short if short in enabled() else "en"


def voice(lang: str) -> str:
    return LANGUAGES.get(lang, LANGUAGES["en"])["voice"]()


def _key() -> str:
    return os.getenv("SARVAM_API_KEY", "").strip()


async def _post(c: httpx.AsyncClient, path: str, body: dict) -> dict:
    r = await c.post(f"{SARVAM}/{path}", headers={"api-subscription-key": _key()}, json=body)
    r.raise_for_status()
    return r.json()


async def _translate(c, text: str, source: str, target: str, roman: bool = False) -> tuple[str, str]:
    """(translated text, detected source code). mayura:v1 is the model with
    source auto-detection, code-mixed mode and Roman output."""
    body = {"input": text[:1000], "source_language_code": source, "target_language_code": target,
            "model": "mayura:v1", "numerals_format": "international"}
    if target != "en-IN":
        body["mode"] = "code-mixed"
    if roman:
        body["output_script"] = "roman"
    j = await _post(c, "translate", body)
    return (j.get("translated_text") or "").strip(), j.get("source_language_code") or source


async def _roman(c, text: str, source: str) -> str:
    """Native script -> Latin letters, for the TFT."""
    j = await _post(c, "transliterate", {"input": text[:1000], "source_language_code": source,
                                         "target_language_code": "en-IN", "numerals_format": "international"})
    return (j.get("transliterated_text") or "").strip()


def _ascii(text: str) -> bool:
    return all(ord(ch) < 128 for ch in text)


async def understand(text: str, detected: str | None = None) -> dict:
    """What the visitor asked, in the forms the kiosk needs.

    detected is speech-to-text's language code; None for typed text, where
    the translator detects it (it understands romanised Hindi and Kannada too).
    Returns {"language", "english", "display", "original"}.
    """
    text = (text or "").strip()
    out = {"language": "en", "english": text, "display": text, "original": text}
    if not text or not _key():
        return out
    lang_code = detected if detected and detected != "unknown" else None
    if lang_code and lang_code.startswith("en"):
        return out                                    # English: no extra round trip
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            if lang_code:
                english_job = _translate(c, text, lang_code, "en-IN")
                roman_job = _roman(c, text, lang_code) if not _ascii(text) else asyncio.sleep(0, text)
                (english, _), display = await asyncio.gather(english_job, roman_job)
            else:
                english, lang_code = await _translate(c, text, "auto", "en-IN")
                display = text if _ascii(text) or lang_code.startswith("en") else await _roman(c, text, lang_code)
    except Exception as e:
        log.warning("could not translate the question (%s); answering it as English", e)
        return out
    out.update(language=reply_language(lang_code), english=english or text, display=display or text)
    return out


_cache: "OrderedDict[tuple[str, str], tuple[str, str]]" = OrderedDict()


async def from_english(text: str, lang: str) -> tuple[str, str]:
    """(native, roman) translation of an English answer. Fixed replies such as
    "I don't know about that." repeat, so results are cached."""
    if lang == "en" or not text or not _key():
        return text, text
    key = (lang, text)
    if key in _cache:
        return _cache[key]
    target = LANGUAGES[lang]["code"]
    async with httpx.AsyncClient(timeout=15) as c:
        (native, _), (roman, _) = await asyncio.gather(
            _translate(c, text, "en-IN", target), _translate(c, text, "en-IN", target, roman=True))
    result = (native or text, roman or text)
    _cache[key] = result
    while len(_cache) > 200:
        _cache.popitem(last=False)
    return result


def spoken_suffix(lang: str, sources: list[str]) -> str:
    if not sources:
        return ""
    names = " and ".join(re.sub(r"^\d+[_\-\s]*", "", s.rsplit(".", 1)[0]).replace("_", " ").replace("-", " ").strip()
                         for s in sources[:2])
    return SOURCE_SUFFIX.get(lang, SOURCE_SUFFIX["en"]).format(src=names)
