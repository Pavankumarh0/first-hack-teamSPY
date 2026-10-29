"""Measure the retrieval gate and suggest EMB_MIN_SCORE / TFIDF_MIN_SCORE.

    python scripts/tune_gate.py

The defaults in .env were tuned for a different embedding model. Score scales
differ between models, so after switching EMBED_MODEL you should re-measure
rather than trust the old numbers. This asks real questions, prints what each
one scores, and suggests thresholds that sit in the gap between the two groups.

No Gemma calls are made, so this costs nothing but embedding requests.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "server"))

import os  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

from rag import Retriever  # noqa: E402

# Questions a real visitor asks. All of these must be answered.
IN_SCOPE = [
    "What are the hostel fees?",
    "What is the hostel fee for an AC double sharing room?",
    "Which bus route comes from Electronic City?",
    "What is the highest placement package?",
    "How much does a masala dosa cost in the canteen?",
    "Who is the head of the Computer Science department?",
    "What are the library timings?",
    "Where can parents park their car?",
    "What is the tuition fee under KCET government quota?",
    "What documents do I need for admission?",
    "Are there scholarships for SC and ST students?",
    "Is there a swimming pool on campus?",
    "What is the attendance requirement?",
    "Is the food vegetarian?",
    "Who is the principal of the college?",
    "Is there an ATM on campus?",
    "Does the college have a counsellor?",
    "Is there EV charging for two wheelers?",
]

# All of these must be refused. The last few are the hard ones: they are
# topically close to the knowledge base without being answerable from it.
OFF_TOPIC = [
    "What is the weather today?",
    "What is the weather in Bengaluru today?",
    "Tell me a joke",
    "Who won the cricket world cup?",
    "What is the capital of France?",
    "How do I cook biryani?",
    "Write me a Python program to sort a list",
    "What is the stock price of Infosys?",
    "What is the fee structure at IIT Bombay?",
    "Which college is better, Oxford College of Engineering or RV College?",
    "What is the syllabus of the GATE exam?",
    "Can you book me a cab to the campus?",
]


def main():
    ret = Retriever(
        ROOT / "kb",
        os.getenv("OLLAMA_URL", "http://localhost:11434"),
        os.getenv("EMBED_MODEL", ""),
        ROOT / "server" / ".cache",
        float(os.getenv("EMB_MIN_SCORE", "0.40")),
        float(os.getenv("TFIDF_MIN_SCORE", "0.08")),
    )
    print(f"\n{len(ret.chunks)} chunks | embed backend: {ret.backend} | "
          f"model: {ret.model or '(none)'} | embeddings: {'yes' if ret.E is not None else 'NO - TF-IDF only'}")

    questions = [(q, True) for q in IN_SCOPE] + [(q, False) for q in OFF_TOPIC]

    # One batched embedding call for every question, rather than one call each --
    # the free tier rate-limits a rapid loop of single requests.
    qv = ret._embed([q for q, _ in questions], query=True) if ret.E is not None else None

    rows = []
    for i, (q, want) in enumerate(questions):
        t = (ret.tfidf.transform([q]) @ ret.M.T).toarray()[0]
        e = ret.E @ qv[i] if qv is not None else None
        rows.append((q, want, float(t.max()), None if e is None else float(e.max())))

    print(f"\n{'want':5s} {'tfidf':>7s} {'embed':>7s}  question")
    print("-" * 74)
    for q, want, t, e in sorted(rows, key=lambda r: -(r[3] if r[3] is not None else r[2])):
        print(f"{'IN ' if want else 'OFF':5s} {t:7.3f} {('  n/a' if e is None else f'{e:7.3f}')}  {q[:52]}")

    # The gate in rag.py passes a question if EITHER score clears its threshold,
    # so the two cannot be tuned independently -- a generous TF-IDF threshold
    # re-admits everything a tight embedding threshold just blocked. Search the
    # pair together against the real rule.
    has_emb = rows[0][3] is not None

    def passes(row, et, tt):
        _, _, t, e = row
        return t >= tt or (e is not None and e >= et)

    def score_pair(et, tt):
        refused_real = sum(1 for r in rows if r[1] and not passes(r, et, tt))
        passed_off = sum(1 for r in rows if not r[1] and passes(r, et, tt))
        return refused_real, passed_off

    e_vals = sorted({round(r[3] - 0.005, 3) for r in rows if r[3] is not None}) or [0.0]
    t_vals = sorted({round(r[2] - 0.005, 3) for r in rows})

    best = None
    for et in e_vals:
        for tt in t_vals:
            refused_real, passed_off = score_pair(et, tt)
            if refused_real:                       # never refuse a real visitor
                continue
            # Among the safe pairs, block the most off-topic questions; break ties
            # by keeping thresholds low, which leaves more headroom for rephrasing.
            cand = (passed_off, et + tt)
            if best is None or cand < best[0]:
                best = (cand, et, tt, passed_off)

    n_in = sum(1 for r in rows if r[1])
    n_off = len(rows) - n_in
    cur_e = float(os.getenv("EMB_MIN_SCORE", "0.40"))
    cur_t = float(os.getenv("TFIDF_MIN_SCORE", "0.08"))
    now_refused, now_passed = score_pair(cur_e, cur_t)

    print(f"\nCurrent settings  EMB_MIN_SCORE={cur_e}  TFIDF_MIN_SCORE={cur_t}")
    print(f"  refuses {now_refused}/{n_in} real questions, "
          f"lets {now_passed}/{n_off} off-topic ones reach Gemma")

    if not has_emb:
        print("\n  (no embeddings - TF-IDF only. Set EMBED_MODEL to improve this.)")
    if best is None:
        print("\n  No threshold pair answers every real question. Lower both, or add"
              "\n  the missing information to kb/.")
        return

    _, et, tt, passed_off = best
    print(f"\nSuggested         EMB_MIN_SCORE={et:.2f}  TFIDF_MIN_SCORE={tt:.2f}")
    print(f"  refuses 0/{n_in} real questions, "
          f"lets {passed_off}/{n_off} off-topic ones reach Gemma")
    if passed_off:
        print("\n  Still reaching Gemma (refused by the prompt rules in llm.py instead):")
        for r in rows:
            if not r[1] and passes(r, et, tt):
                print(f"    - {r[0]}")
    print("\nA question passes the gate if EITHER score clears its threshold.")


if __name__ == "__main__":
    main()
