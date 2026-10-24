"""Speech-to-text (faster-whisper), text-to-speech (edge-tts) and audio helpers."""
import io, os, re, threading
import numpy as np

_model, _lock = None, threading.Lock()


def _whisper():
    global _model
    with _lock:
        if _model is None:
            from faster_whisper import WhisperModel
            _model = WhisperModel(os.getenv("WHISPER_MODEL", "base.en"), device="cpu", compute_type="int8")
    return _model


def _run(audio, hint):
    lang = os.getenv("STT_LANGUAGE", "en") or None
    segs, _ = _whisper().transcribe(audio, language=lang, beam_size=5, vad_filter=True,
                                    condition_on_previous_text=False, initial_prompt=hint or None)
    return " ".join(s.text.strip() for s in segs).strip()


def transcribe_file(data: bytes, hint: str = "") -> str:
    return _run(io.BytesIO(data), hint)


def prepare_pcm(pcm: bytes, rate: int) -> np.ndarray:
    """ESP32 ADC samples (int16 LE) -> clean 16 kHz float32 for Whisper."""
    x = np.frombuffer(pcm[: len(pcm) // 2 * 2], dtype="<i2").astype(np.float32)
    x -= x.mean()
    x = np.append(x[0], x[1:] - 0.95 * x[:-1])                    # pre-emphasis / DC & rumble removal
    peak = np.percentile(np.abs(x), 99.5) or 1.0
    x = np.clip(x / (peak * 1.2), -1, 1)                           # normalise (ADC mic is very quiet)
    if rate != 16000:
        x = np.interp(np.linspace(0, len(x) - 1, int(len(x) * 16000 / rate)), np.arange(len(x)), x)
    return x.astype(np.float32)


def transcribe_pcm(pcm: bytes, rate: int, hint: str = "") -> str:
    return _run(prepare_pcm(pcm, rate), hint)


def save_wav(path, pcm: bytes, rate: int):
    import wave
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm)


async def synth_mp3(text: str, voice: str) -> bytes:
    import edge_tts
    buf = bytearray()
    async for ch in edge_tts.Communicate(text, voice).stream():
        if ch["type"] == "audio":
            buf += ch["data"]
    if not buf:
        raise RuntimeError("TTS returned no audio")
    return bytes(buf)


def mp3_to_u8(mp3: bytes, rate: int = 8000) -> bytes:
    """MP3 -> unsigned 8-bit mono PCM (what the ESP32 DAC plays). Uses PyAV (installed with faster-whisper)."""
    import av
    rs = av.AudioResampler(format="s16", layout="mono", rate=rate)
    parts = []
    with av.open(io.BytesIO(mp3)) as c:
        for fr in c.decode(audio=0):
            parts += [f.to_ndarray().reshape(-1) for f in rs.resample(fr)]
    parts += [f.to_ndarray().reshape(-1) for f in rs.resample(None)]
    x = np.concatenate(parts).astype(np.float32)
    x = x / (np.abs(x).max() or 1) * 0.9
    return np.clip(x * 127 + 128, 0, 255).astype(np.uint8).tobytes()


def for_speech(t: str) -> str:
    t = re.sub(r"Rs\.?\s*", "rupees ", t)
    t = re.sub(r"\bLPA\b", "lakhs per annum", t)
    return t.replace("&", " and ").replace("%", " percent")


def ascii_clean(t: str) -> str:
    for a, b in {"\u2013": "-", "\u2014": "-", "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"', "\u20b9": "Rs. "}.items():
        t = t.replace(a, b)
    return t.encode("ascii", "ignore").decode()
