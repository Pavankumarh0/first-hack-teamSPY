"""Campus Saathi server: landing page, web kiosk, RAG + Gemma Q&A, and the ESP32 endpoints."""
import asyncio, json, logging, os, re, uuid
from collections import OrderedDict
from pathlib import Path

from dotenv import load_dotenv
ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

from fastapi import FastAPI, File, Request, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

import llm, speech
from rag import Retriever

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s: %(message)s")
log = logging.getLogger("saathi")
META = json.loads((ROOT / "kb" / "meta.json").read_text(encoding="utf-8"))
VOICE = os.getenv("TTS_VOICE", "en-IN-NeerjaNeural")
TTS_ON = os.getenv("TTS_ENABLED", "1") == "1"
PLAY_RATE = int(os.getenv("ESP_PLAY_RATE", "8000"))
SHORT = META["short"]

OFF_TOPIC = (f"I'm sorry, I can only answer questions about {META['name']} using the information I have. "
             "Please ask me about admissions, fees, placements, hostels, buses, food or facilities.")
NOT_FOUND = (f"I don't have that detail in my information. Please contact the {SHORT} admission office at "
             f"{META['phone']} or {META['email']}.")
BROKEN = "Sorry, my thinking engine is not reachable right now. Please ask the front desk for help."
UNHEARD = "Sorry, I couldn't hear that clearly. Please try again and speak close to the microphone."
GREET = re.compile(r"^\W*(hi|hello|hey|namaste|good (morning|afternoon|evening))\b[\s\W]*(saathi|there)?\W*$", re.I)
THANKS = re.compile(r"^\W*(thanks|thank you|thank you very much|ok thanks|bye|goodbye)\W*$", re.I)

app = FastAPI(title="Campus Saathi")
RET: Retriever | None = None
AUDIO: "OrderedDict[str, dict]" = OrderedDict()
LAST_Q: dict = {}


@app.on_event("startup")
async def startup():
    global RET
    RET = await asyncio.to_thread(
        Retriever, ROOT / "kb", os.getenv("OLLAMA_URL", "http://localhost:11434"), os.getenv("EMBED_MODEL", ""),
        ROOT / "server" / ".cache", float(os.getenv("EMB_MIN_SCORE", "0.40")), float(os.getenv("TFIDF_MIN_SCORE", "0.08")))
    log.info("Knowledge base: %d chunks", len(RET.chunks))
    asyncio.create_task(asyncio.to_thread(speech._whisper))  # warm up speech model


def clean(t: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[*#_`>]", "", t)).strip()


def pack(q, a, in_scope, sources=()):
    aid = uuid.uuid4().hex[:12]
    AUDIO[aid] = {"text": a}
    while len(AUDIO) > 60:
        AUDIO.popitem(last=False)
    return {"question": q, "answer": a, "in_scope": in_scope, "sources": list(sources),
            "audio_id": aid if TTS_ON else None}


async def answer_question(q: str, sid: str = "web") -> dict:
    q = (q or "").strip()
    if not q:
        return pack(q, UNHEARD, False)
    if GREET.match(q):
        return pack(q, META["greeting"], True)
    if THANKS.match(q):
        return pack(q, "You're welcome! Ask me anything else about the campus.", True)
    prev = LAST_Q.get(sid)
    rq = f"{prev} {q}" if prev and len(q.split()) <= 5 else q          # short follow-ups reuse the last topic
    hits, relevant = await asyncio.to_thread(RET.search, rq)
    if not relevant:
        return pack(q, OFF_TOPIC, False)
    ctx = "\n\n".join(f"[{h['title']}]\n{h['text']}" for h in hits)
    try:
        raw = await llm.generate(llm.PROMPT.format(college=META["name"], short=SHORT, context=ctx, question=q))
    except Exception as e:
        log.error("LLM error: %s", e)
        return pack(q, BROKEN, False)
    if "NOT_IN_KB" in raw.upper():
        return pack(q, NOT_FOUND, False)
    LAST_Q[sid] = q
    return pack(q, clean(raw), True, sorted({h["source"] for h in hits}))


class Ask(BaseModel):
    question: str
    session: str = "web"


@app.post("/api/ask")
async def api_ask(body: Ask):
    return await answer_question(body.question, body.session)


@app.post("/api/ask-audio")
async def api_ask_audio(file: UploadFile = File(...), session: str = "web"):
    text = await asyncio.to_thread(speech.transcribe_file, await file.read(), META["stt_hint"])
    return await answer_question(text, session) if text else pack("", UNHEARD, False)


@app.post("/api/esp/ask")
async def esp_ask(request: Request):
    """Raw int16 little-endian mono PCM from the ESP32 ADC; header X-Sample-Rate."""
    pcm, rate = await request.body(), int(request.headers.get("x-sample-rate", "8000"))
    (ROOT / "server" / "debug").mkdir(exist_ok=True)
    speech.save_wav(ROOT / "server" / "debug" / "last_esp.wav", pcm, rate)   # listen to this to tune the mic
    text = await asyncio.to_thread(speech.transcribe_pcm, pcm, rate, META["stt_hint"]) if len(pcm) > rate else ""
    log.info("ESP heard: %r", text)
    return esp_payload(await answer_question(text, "esp") if text else pack("", UNHEARD, False))


@app.post("/api/esp/text")
async def esp_text(body: Ask):
    return esp_payload(await answer_question(body.question, "esp"))


def esp_payload(r):
    return {"q": speech.ascii_clean(r["question"]), "a": speech.ascii_clean(r["answer"]),
            "audio": f"/api/audio/{r['audio_id']}.u8" if r["audio_id"] else ""}


@app.get("/api/audio/{aid}.{ext}")
async def audio(aid: str, ext: str):
    item = AUDIO.get(aid)
    if not item or ext not in ("mp3", "u8"):
        return Response(status_code=404)
    try:
        if "mp3" not in item:
            item["mp3"] = await speech.synth_mp3(speech.for_speech(item["text"]), VOICE)
        if ext == "mp3":
            return Response(item["mp3"], media_type="audio/mpeg")
        if "u8" not in item:
            item["u8"] = await asyncio.to_thread(speech.mp3_to_u8, item["mp3"], PLAY_RATE)
        return Response(item["u8"], media_type="application/octet-stream")
    except Exception as e:
        log.warning("TTS failed: %s", e)
        return Response(status_code=503)


@app.get("/api/health")
async def health():
    return {"ok": True, "college": META["name"], "chunks": len(RET.chunks), "embeddings": RET.E is not None,
            "backend": os.getenv("LLM_BACKEND", "ollama"), "model": os.getenv("GEMMA_MODEL", "gemma3:4b")}


@app.get("/")
async def landing():
    return FileResponse(ROOT / "web" / "index.html")


@app.get("/kiosk")
async def kiosk():
    return FileResponse(ROOT / "web" / "kiosk.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=os.getenv("HOST", "0.0.0.0"), port=int(os.getenv("PORT", "8000")))
