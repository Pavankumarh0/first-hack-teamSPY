"""Setup checker. Run this first after installing dependencies.

    python scripts/check_setup.py

It verifies the virtual environment, the dependencies, the .env key, the knowledge
base, the embedding model, retrieval quality and finally one live Gemma call. Every
stage is reported separately so a failure points at one thing.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

OK = "  [ok]   "
BAD = "  [FAIL] "
WARN = "  [warn] "


def check_python() -> bool:
    version = sys.version_info
    print(f"Python {version.major}.{version.minor}.{version.micro}")
    in_venv = sys.prefix != getattr(sys, "base_prefix", sys.prefix)
    print(f"{OK if in_venv else WARN}virtual environment: {sys.prefix}")
    if version < (3, 9):
        print(f"{BAD}Python 3.9 or newer is required")
        return False
    return True


def check_imports() -> bool:
    ok = True
    for module, package in [
        ("numpy", "numpy"),
        ("sentence_transformers", "sentence-transformers"),
        ("google.genai", "google-genai"),
        ("pypdf", "pypdf"),
        ("gradio", "gradio"),
    ]:
        try:
            __import__(module)
            print(f"{OK}{package}")
        except ImportError:
            print(f"{BAD}{package} is missing - pip install {package}")
            ok = False
    return ok


def check_key() -> bool:
    from campus_mithra import config

    key = config.get_api_key()
    if not key:
        print(f"{BAD}no API key. Copy .env.example to .env and add GOOGLE_API_KEY")
        return False
    print(f"{OK}API key loaded ({key[:6]}...{key[-4:]}, {len(key)} chars)")
    return True


def check_knowledge_base() -> bool:
    from campus_mithra import config
    from campus_mithra.knowledge import build_chunks, list_documents

    try:
        docs = list_documents()
        chunks = build_chunks()
    except FileNotFoundError as exc:
        print(f"{BAD}{exc}")
        return False

    words = sum(len(c.body.split()) for c in chunks)
    print(f"{OK}{len(docs)} documents -> {len(chunks)} chunks, {words} words")
    print(f"         chunk_size={config.CHUNK_SIZE} overlap={config.CHUNK_OVERLAP} "
          f"top_k={config.TOP_K} temperature={config.TEMPERATURE}")
    for doc in docs:
        count = sum(1 for c in chunks if c.source == doc.name)
        print(f"         {doc.name:38s} {count:3d} chunks")
    return True


def check_retrieval() -> bool:
    """Exercise guards 1 and 2. No API key and no API call needed."""
    from campus_mithra import CampusMithra

    print("         loading embedding model (first run downloads about 90 MB) ...")
    assistant = CampusMithra.load(verbose=False)
    print(f"{OK}embeddings {assistant.retriever.matrix.shape}")

    probes = [
        # (question, should reach Gemma)
        ("hostel mess timings", True),
        ("bus route from Electronic City", True),
        ("highest placement package", True),
        ("masala dosa price", True),
        ("who is the principal of the college", True),
        ("is there a swimming pool", True),
        ("what is the weather today", False),
        ("who won the football world cup", False),
        ("tell me a joke", False),
        ("how do I cook biryani", False),
    ]

    ok = True
    for question, should_pass in probes:
        report = assistant.scope_report(question)
        passes = bool(report["would_reach_gemma"])
        good = passes == should_pass
        if not report["passes_floor"]:
            verdict = "floor"
        elif not report["passes_off_topic_guard"]:
            verdict = "off-topic"
        else:
            verdict = "-> gemma"
        print(f"{OK if good else BAD}kb={report['kb_score']:.3f} "
              f"off={report['off_topic_score']:.3f} {verdict:10s} {question!r}")
        if not good:
            print(f"         closest off-topic exemplar: "
                  f"{report['closest_off_topic_exemplar']!r}")
        ok = ok and good

    if not ok:
        print(f"{WARN}tune MIN_SIMILARITY or OFF_TOPIC_MARGIN in .env, then re-run")
        print(f"{WARN}see the whole test set with: python cli.py --guards")
    return ok


def check_gemma() -> bool:
    from campus_mithra import CampusMithra
    from campus_mithra.generator import GemmaAnswerer, GemmaUnavailableError

    answerer = GemmaAnswerer()
    print(f"         model: {answerer.model}")
    assistant = CampusMithra.load(verbose=False)
    result = assistant.ask("What is the tuition fee under KCET government quota?")

    if result.error:
        print(f"{BAD}{result.error}")
        try:
            models = [m for m in answerer.available_models() if "gemma" in m.lower()]
            if models:
                print("         Gemma ids available to this key:")
                for model in models:
                    print(f"           {model}")
        except GemmaUnavailableError:
            pass
        return False

    print(f"{OK}Gemma answered in {result.latency_ms} ms")
    print(f"         Q: {result.question}")
    print(f"         A: {result.answer}")
    print(f"         sources: {', '.join(result.sources)}")

    off_topic = assistant.ask("What is the weather in Bengaluru today?")
    if off_topic.grounded:
        print(f"{BAD}off-topic question was answered instead of refused")
        return False
    print(f"{OK}off-topic question refused: {off_topic.answer}")
    return True


def main() -> int:
    stages = [
        ("Python environment", check_python),
        ("Dependencies", check_imports),
        ("API key", check_key),
        ("Knowledge base", check_knowledge_base),
        ("Embeddings and retrieval", check_retrieval),
        ("Gemma generation", check_gemma),
    ]

    failures: list[str] = []
    for name, fn in stages:
        print(f"\n--- {name} ---")
        try:
            if not fn():
                failures.append(name)
        except Exception as exc:  # noqa: BLE001 - report and continue
            print(f"{BAD}{type(exc).__name__}: {exc}")
            failures.append(name)

    print("\n" + "=" * 62)
    if failures:
        print("Setup incomplete. Fix these stages:")
        for name in failures:
            print(f"  - {name}")
        return 1
    print("All checks passed. Run 'python app.py' for the web UI")
    print("or 'python server.py' for the ESP32 bridge.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
