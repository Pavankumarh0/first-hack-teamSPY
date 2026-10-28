"""Campus Mithra server: landing page, web kiosk, RAG + Gemma Q&A, and the ESP32 endpoints."""
import asyncio, json, logging, os, re, uuid
from collections import OrderedDict
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

from fastapi import FastAPI, File, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, Response
from pydantic import BaseModel, Field

import llm, speech
from rag import Retriever

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s: %(message)s")
log = logging.getLogger("mithra")
META = json.loads((ROOT / "kb" / "meta.json").read_text(encoding="utf-8"))
VOICE = os.getenv("TTS_VOICE", "en-IN-NeerjaNeural")
TTS_ON = os.getenv("TTS_ENABLED", "1") == "1"
PLAY_RATE = int(os.getenv("ESP_PLAY_RATE", "8000"))        # 8-bit DAC kiosk
I2S_RATE = int(os.getenv("ESP_I2S_RATE", "16000"))         # I2S amplifier kiosk
SHORT = META["short"]

# Said whenever the knowledge base has nothing on the question - whether it is
# off topic ("what's the weather") or a college question the documents don't
# cover ("is there a helipad").
DONT_KNOW = (f"Sorry, I don't know about that. I can only tell you about {META['name']}: "
             "its rules and regulations, admissions, fees, hostels, placements, transport "
             "and campus facilities.")
OFF_TOPIC = DONT_KNOW
NOT_FOUND = DONT_KNOW + f" For anything else, please contact the admission office at {META['phone']}."
# Only reached if Gemma fails AND the retrieved text gives nothing to read out.
BROKEN = "Sorry, I couldn't put that answer together just now. Please ask me again."
UNHEARD = "Sorry, I couldn't hear that clearly. Please try again and speak close to the microphone."
# Distinct from UNHEARD on purpose: UNHEARD means silence was heard, this means
# the speech service failed. Collapsing the two hides an outage behind what looks
# like a quiet microphone.
DEAF = "Sorry, my speech service is not working right now. Please type your question or ask the front desk."
GREET = re.compile(r"^\W*(hi|hello|hey|namaste|good (morning|afternoon|evening))\b[\s\W]*(mithra|there)?\W*$", re.I)
THANKS = re.compile(r"^\W*(thanks|thank you|thank you very much|ok thanks|bye|goodbye)\W*$", re.I)

RET: Retriever | None = None
AUDIO: "OrderedDict[str, dict]" = OrderedDict()
LAST_Q: dict = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Build the retriever before serving, and warm the speech model in the
    background so the first spoken question is not the slow one."""
    global RET
    RET = await asyncio.to_thread(
        Retriever, ROOT / "kb", os.getenv("OLLAMA_URL", "http://localhost:11434"), os.getenv("EMBED_MODEL", ""),
        ROOT / "server" / ".cache", float(os.getenv("EMB_MIN_SCORE", "0.40")), float(os.getenv("TFIDF_MIN_SCORE", "0.08")))
    log.info("Knowledge base: %d chunks", len(RET.chunks))
    log.info("Speech-to-text provider: %s", speech.provider())
    # A no-op for Sarvam, which has no local model to load.
    warm = asyncio.create_task(asyncio.to_thread(speech.warmup))
    try:
        yield
    finally:
        warm.cancel()


app = FastAPI(title="Campus Mithra", lifespan=lifespan)


def clean(t: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[*#_`>]", "", t)).strip()


def spoken_source(name: str) -> str:
    """'05_hostel.md' -> 'hostel', '10_canteen_and_food.md' -> 'canteen and food'."""
    return re.sub(r"^\d+[_\-\s]*", "", name.rsplit(".", 1)[0]).replace("_", " ").replace("-", " ").strip()


def pack(q, a, in_scope, sources=(), via="gemma"):
    """Bundle a reply. The answer is spoken with its source named at the end,
    so a visitor hears where the information came from, not just reads it."""
    sources = list(sources)
    speak = a
    if sources and os.getenv("SPEAK_SOURCES", "1") == "1":
        speak += " This is from the " + " and ".join(spoken_source(s) for s in sources[:2]) + " information."
    aid = uuid.uuid4().hex[:12]
    AUDIO[aid] = {"text": speak}
    while len(AUDIO) > 60:
        AUDIO.popitem(last=False)
    return {"question": q, "answer": a, "in_scope": in_scope, "sources": sources, "via": via,
            "audio_id": aid if TTS_ON else None}


_STOP = set("""a an the is are was were be of to in on at for from by with and or what which who
whom how when where why do does did can could will would i me my we our you your it its this that
there here about tell please much many any some have has had get give college campus svit""".split())


def _words(text: str) -> set[str]:
    return {w.rstrip("s") for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in _STOP and len(w) > 1}


def extractive_answer(question: str, hits: list[dict]) -> tuple[str, str] | None:
    """Read the most relevant lines straight out of the knowledge base.

    Used only when Gemma itself is unreachable. Every word comes verbatim from the
    college documents, so it can be less fluent than Gemma but never wrong -
    which is better than telling a visitor the information doesn't exist when it
    does. Table rows are rewritten as 'AC double sharing: room rent per year
    Rs. 78,000, ...' so they read aloud sensibly.
    """
    want = _words(question)
    if not want:
        return None
    best = []
    for rank, h in enumerate(hits[:2]):
        header = None
        for line in h["text"].splitlines():
            line = line.strip()
            if not line or re.fullmatch(r"\|?[\s:\-|]+\|?", line):
                continue
            if line.startswith("|"):
                cells = [c.strip() for c in line.strip("|").split("|")]
                if header is None:
                    header = cells
                    continue
                unit = cells[0] + ": " + ", ".join(
                    f"{hd.lower()} {c}" for hd, c in zip(header[1:], cells[1:]) if c)
            else:
                header = None
                unit = re.sub(r"^[-*\d.)\s]+", "", line).replace("**", "")
            for sentence in re.split(r"(?<=[.!?])\s+", unit):
                score = len(want & _words(sentence))
                if score:
                    best.append((score, -rank, sentence.strip(), h["source"]))
    if not best:
        return None
    best.sort(reverse=True)
    top = best[0][0]
    picked = [b for b in best if b[0] >= max(1, top - 1)][:2]
    text = " ".join(p[2].rstrip(".") + "." for p in picked)
    if len(text) > 320:
        text = text[:317].rsplit(" ", 1)[0] + "..."
    return "Here is what I found. " + text, picked[0][3]


async def answer_question(q: str, sid: str = "web", campus_context: list[dict] | None = None) -> dict:
    q = (q or "").strip()
    if not q:
        return pack(q, UNHEARD, False)
    if GREET.match(q):
        if campus_context is not None:
            return pack(q, "Namaste! I can help with campus places, clubs, events, and notices.", True)
        return pack(q, META["greeting"], True)
    if THANKS.match(q):
        return pack(q, "You're welcome! Ask me anything else about the campus.", True)
    if campus_context is not None:
        hits = [
            {"source": item.source, "title": clean(item.title)[:160], "text": clean(item.text)[:1200]}
            for item in campus_context if clean(item.title) and clean(item.text)
        ]
        if not hits:
            return pack(q, "I couldn't find a matching published campus record. Try the club, event, notice, building, or room name.", False, via="campus-data")
        relevant = True
    else:
        prev = LAST_Q.get(sid)
        rq = f"{prev} {q}" if prev and len(q.split()) <= 5 else q          # short follow-ups reuse the last topic
        hits, relevant = await asyncio.to_thread(RET.search, rq)
    if not relevant:
        return pack(q, OFF_TOPIC, False, via="gate")
    # Each section is labelled with its file, so Gemma can say which ones it used.
    ctx = "\n\n".join(f"[{h['source']}] {h['title']}\n{h['text']}" for h in hits)
    try:
        college = "Campus Mithra" if campus_context is not None else META["name"]
        short = "your campus" if campus_context is not None else SHORT
        raw = await llm.generate(llm.PROMPT.format(college=college, short=short, context=ctx, question=q))
    except Exception as e:
        log.error("LLM error: %s", e)
        found = extractive_answer(q, hits)
        if found:
            log.info("answered from the knowledge base directly (Gemma unavailable)")
            return pack(q, found[0], True, [found[1]], via="kb-direct")
        return pack(q, BROKEN, False, via="error")
    if "NOT_IN_KB" in raw.upper():
        if campus_context is not None:
            return pack(q, "I couldn't find that detail in the published campus records. Try asking with a specific club, event, notice, building, or room name.", False, retrieved, via="campus-data")
        return pack(q, NOT_FOUND, False, via="gemma")

    answer, cited = llm.split_sources(raw)
    retrieved = [h["source"] for h in hits]
    # Trust only citations of files that were actually retrieved; if Gemma
    # skipped the line, credit the best-matching section.
    sources = [s for s in cited if s in retrieved] or retrieved[:1]
    LAST_Q[sid] = q
    log.info("answered from %s", ", ".join(sources))
    return pack(q, clean(answer), True, sources)


class CampusContext(BaseModel):
    source: Literal["buildings.md", "locations.md", "clubs.md", "events.md", "announcements.md", "campus_map.md"]
    title: str = Field(max_length=160)
    text: str = Field(max_length=1200)


class Ask(BaseModel):
    question: str
    session: str = "web"
    campus_context: list[CampusContext] | None = Field(default=None, max_length=30)


class Speak(BaseModel):
    text: str


@app.post("/api/speak")
async def api_speak(body: Speak):
    """Create speech for a trusted, already-composed campus API response."""
    text = clean(body.text)[:1200]
    if not text:
        return {"audio_id": None}
    aid = uuid.uuid4().hex[:12]
    AUDIO[aid] = {"text": text}
    while len(AUDIO) > 60:
        AUDIO.popitem(last=False)
    return {"audio_id": aid if TTS_ON else None}


@app.post("/api/ask")
async def api_ask(body: Ask):
    return await answer_question(body.question, body.session, body.campus_context)


@app.post("/api/ask-audio")
async def api_ask_audio(file: UploadFile = File(...), session: str = "web"):
    try:
        text = await asyncio.to_thread(
            speech.transcribe_file, await file.read(), META["stt_hint"],
            file.filename or "audio.wav")
    except speech.SttError as e:
        log.error("STT error: %s", e)
        return pack("", DEAF, False)
    log.info("Heard: %r", text)
    return await answer_question(text, session) if text else pack("", UNHEARD, False)


@app.post("/api/transcribe")
async def api_transcribe(file: UploadFile = File(...)):
    """Speech to text only. Lets a client show the visitor's question while the
    (much slower) answer is still being generated."""
    try:
        text = await asyncio.to_thread(
            speech.transcribe_file, await file.read(), META["stt_hint"],
            file.filename or "audio.wav")
    except speech.SttError as e:
        log.error("STT error: %s", e)
        return {"ok": False, "text": "", "error": str(e).splitlines()[0], "reply": DEAF}
    log.info("Heard: %r", text)
    return {"ok": True, "text": text, "reply": "" if text else UNHEARD}


@app.post("/api/esp/ask")
async def esp_ask(request: Request):
    """Raw int16 little-endian mono PCM from the ESP32 ADC; header X-Sample-Rate."""
    pcm, rate = await request.body(), int(request.headers.get("x-sample-rate", "8000"))
    (ROOT / "server" / "debug").mkdir(exist_ok=True)
    speech.save_wav(ROOT / "server" / "debug" / "last_esp.wav", pcm, rate)   # listen to this to tune the mic
    try:
        text = await asyncio.to_thread(speech.transcribe_pcm, pcm, rate, META["stt_hint"]) if len(pcm) > rate else ""
    except speech.SttError as e:
        log.error("STT error: %s", e)
        return esp_payload(pack("", DEAF, False))
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
    if not item or ext not in ("mp3", "u8", "s16"):
        return Response(status_code=404)
    try:
        if "mp3" not in item:
            item["mp3"] = await speech.synth_mp3(speech.for_speech(item["text"]), VOICE)
        if ext == "mp3":
            return Response(item["mp3"], media_type="audio/mpeg")
        if ext == "s16":
            # 16-bit for the I2S amplifier kiosk (MAX98357A)
            if "s16" not in item:
                item["s16"] = await asyncio.to_thread(speech.mp3_to_pcm16, item["mp3"], I2S_RATE)
            return Response(item["s16"], media_type="application/octet-stream")
        if "u8" not in item:
            item["u8"] = await asyncio.to_thread(speech.mp3_to_u8, item["mp3"], PLAY_RATE)
        return Response(item["u8"], media_type="application/octet-stream")
    except Exception as e:
        log.warning("TTS failed: %s", e)
        return Response(status_code=503)


@app.get("/api/health")
async def health():
    backend = os.getenv("LLM_BACKEND", "ollama")
    # Report the model actually in use: GEMMA_MODEL is the Ollama tag and says
    # nothing about which model answers when the backend is gemini.
    model = (os.getenv("GEMINI_MODEL", "gemma-3-27b-it") if backend == "gemini"
             else os.getenv("GEMMA_MODEL", "gemma3:4b"))
    return {"ok": True, "college": META["name"], "chunks": len(RET.chunks), "embeddings": RET.E is not None,
            "backend": backend, "model": model, "stt": speech.provider(),
            "embed_model": RET.model or None}


# ---------------------------------------------------------------------------
# The web UI is a Next.js app in web/, exported to static files by `npm run build`.
# Mounting it last means every /api route above still wins.
# ---------------------------------------------------------------------------
SITE = ROOT / "web" / "out"

NO_BUILD = """<!doctype html><html><head><meta charset="utf-8">
<title>Campus Mithra - site not built</title>
<style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:12vh auto;padding:0 1rem;
color:#16182b;line-height:1.7}code{background:#f6f2ea;padding:2px 6px;border-radius:4px}
a{color:#0f9b8e}</style></head><body>
<h1>The API is running. The site is not built yet.</h1>
<p>Build the Next.js app once, then reload this page:</p>
<p><code>cd web</code><br><code>npm install</code><br><code>npm run build</code></p>
<p>While working on the site, run <code>npm run dev</code> in <code>web/</code> and open
<a href="http://localhost:3000">localhost:3000</a> instead - it proxies the API back here.</p>
<p>API health: <a href="/api/health">/api/health</a></p>
</body></html>"""


@app.get("/", include_in_schema=False)
async def landing():
    index = SITE / "index.html"
    return FileResponse(index) if index.exists() else HTMLResponse(NO_BUILD, status_code=503)


if SITE.exists():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=SITE, html=True), name="site")
else:
    log.warning("web/out not found - run 'npm run build' in web/ to build the site")

    @app.get("/kiosk", include_in_schema=False)
    @app.get("/kiosk/", include_in_schema=False)
    async def kiosk_not_built():
        return HTMLResponse(NO_BUILD, status_code=503)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=os.getenv("HOST", "0.0.0.0"), port=int(os.getenv("PORT", "8000")))
