"""Campus Mithra command line interface.

    python cli.py                            interactive question loop
    python cli.py "what is the hostel fee"   answer one question and exit
    python cli.py --retrieve "bus routes"    show retrieval only, no Gemma call
    python cli.py --scope "tell me a joke"   show both guard scores, no Gemma call
    python cli.py --guards                   evaluate guards 1 and 2 offline
    python cli.py --info                     print configuration and KB stats
    python cli.py --test                     run the full grounding test set
"""

from __future__ import annotations

import argparse
import json
import sys

from campus_mithra import CampusMithra, config

TEST_QUESTIONS = [
    # In scope, must be answered from the knowledge base.
    ("What is the tuition fee under KCET government quota?", True),
    ("What is the highest placement package?", True),
    ("What are the mess timings in the hostel?", True),
    ("Which bus route comes from Electronic City?", True),
    ("Who is the principal of the college?", True),
    ("How many books are there in the library?", True),
    ("Where can parents park their car?", True),
    ("How much does a masala dosa cost in the canteen?", True),
    ("How many faculty members have a PhD?", True),
    ("Is there a swimming pool on campus?", True),
    ("What is the attendance requirement?", True),
    ("Are there scholarships for SC and ST students?", True),
    ("Can I get a single room in the hostel?", True),
    ("Is the food vegetarian?", True),
    ("Is there EV charging for two wheelers?", True),
    # Out of scope or absent, must be refused.
    ("What is the weather in Bengaluru today?", False),
    ("Who won the cricket world cup?", False),
    ("Write me a Python program to sort a list", False),
    ("Tell me a joke", False),
    ("What is the capital of France?", False),
    ("How do I cook biryani?", False),
    # Harder: topically adjacent, caught by the prompt contract rather than a guard.
    ("What is the fee structure at IIT Bombay?", False),
    ("Which college is better, SVIT or RV College?", False),
    ("What is the salary of the principal?", False),
    ("What is the syllabus of the GATE exam?", False),
    ("Can you book me a cab to the campus?", False),
    ("How many students failed last semester?", False),
]


def print_answer(result, show_sources: bool = True) -> None:
    print(f"\n{result.answer}\n")
    if result.error:
        print(f"  ! {result.error}\n")
    if show_sources and result.passages:
        print(f"  grounded={result.grounded}  top_score={result.top_score:.3f}  "
              f"{result.latency_ms} ms")
        for position, chunk in enumerate(result.passages, start=1):
            print(f"  [{position}] {chunk.citation()}  ({chunk.score:.3f})")
        print()


def run_tests(assistant: CampusMithra) -> int:
    passed = 0
    failed: list[str] = []
    for question, should_answer in TEST_QUESTIONS:
        result = assistant.ask(question)

        # An outage would otherwise look like a pass on every must-refuse question.
        if result.blocked_by == "api":
            print(f"\nAborted: the Gemma call is failing, so this test proves nothing.")
            print(f"  {result.error}")
            return 1

        answered = result.grounded
        ok = answered == should_answer
        mark = "PASS" if ok else "FAIL"
        want = "answer" if should_answer else "refuse"
        got = "answer" if answered else "refuse"
        by = f" by={result.blocked_by}" if result.blocked_by else ""
        print(f"[{mark}] want={want:6s} got={got:6s} kb={result.top_score:.3f}{by}  {question}")
        if not ok:
            failed.append(question)
            if result.error:
                print(f"        error: {result.error}")
        else:
            passed += 1
    print(f"\n{passed}/{len(TEST_QUESTIONS)} passed")
    if failed:
        print("Failed:")
        for question in failed:
            print(f"  - {question}")
    return 0 if not failed else 1


def run_guard_eval(assistant: CampusMithra) -> int:
    """Evaluate guards 1 and 2 with no API call.

    Guard 3 (the prompt contract) cannot be tested offline, so questions that are
    expected to reach Gemma are reported rather than counted as failures.
    """
    wrongly_refused: list[str] = []
    reach_model_offtopic: list[str] = []

    print(f"{'want':6s} {'kb':6s} {'off':6s} {'verdict':12s} question")
    for question, should_answer in TEST_QUESTIONS:
        report = assistant.scope_report(question)
        reaches = bool(report["would_reach_gemma"])
        if not report["passes_floor"]:
            verdict = "floor"
        elif not report["passes_off_topic_guard"]:
            verdict = "off_topic"
        else:
            verdict = "-> gemma"

        flag = " "
        if should_answer and not reaches:
            flag = "!"
            wrongly_refused.append(question)
        if not should_answer and reaches:
            flag = "~"
            reach_model_offtopic.append(question)

        print(f"{flag}{'IN' if should_answer else 'OFF':5s} "
              f"{report['kb_score']:.3f}  {report['off_topic_score']:.3f}  "
              f"{verdict:12s} {question}")

    n_in = sum(1 for _, a in TEST_QUESTIONS if a)
    n_off = len(TEST_QUESTIONS) - n_in
    print(f"\nin-scope questions blocked before Gemma : "
          f"{len(wrongly_refused)}/{n_in}   (must be 0)")
    print(f"off-topic questions blocked before Gemma: "
          f"{n_off - len(reach_model_offtopic)}/{n_off}")

    if wrongly_refused:
        print("\nWrongly refused - lower MIN_SIMILARITY or raise OFF_TOPIC_MARGIN:")
        for question in wrongly_refused:
            print(f"  ! {question}")
    if reach_model_offtopic:
        print("\nLeft for the prompt contract to refuse (expected, not a failure):")
        for question in reach_model_offtopic:
            print(f"  ~ {question}")
    return 1 if wrongly_refused else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Campus Mithra CLI")
    parser.add_argument("question", nargs="*", help="question to ask")
    parser.add_argument("--retrieve", metavar="Q", help="show retrieval only")
    parser.add_argument("--scope", metavar="Q", help="show both guard scores")
    parser.add_argument("--guards", action="store_true",
                        help="evaluate guards 1 and 2 offline, no API calls")
    parser.add_argument("--info", action="store_true", help="print configuration")
    parser.add_argument("--test", action="store_true", help="run the grounding test set")
    parser.add_argument("--json", action="store_true", help="print the answer as JSON")
    parser.add_argument("--quiet", action="store_true", help="hide retrieval detail")
    args = parser.parse_args()

    if args.info:
        assistant = CampusMithra.load(verbose=False)
        print(json.dumps(assistant.info(), indent=2))
        return 0

    assistant = CampusMithra.load(verbose=not args.json)

    if args.retrieve:
        for position, chunk in enumerate(assistant.retrieve_only(args.retrieve), start=1):
            print(f"\n[{position}] {chunk.citation()}  score={chunk.score:.4f}")
            print(chunk.body)
        return 0

    if args.scope:
        print(json.dumps(assistant.scope_report(args.scope), indent=2))
        return 0

    if args.guards:
        return run_guard_eval(assistant)

    if args.test:
        return run_tests(assistant)

    if args.question:
        result = assistant.ask(" ".join(args.question))
        if args.json:
            print(json.dumps(result.to_dict(), indent=2))
        else:
            print_answer(result, show_sources=not args.quiet)
        return 0

    print(f"\n{config.ASSISTANT_NAME} - ask about {config.COLLEGE_NAME}")
    print("Type a question, or 'quit' to exit.\n")
    while True:
        try:
            question = input("you > ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if question.lower() in {"quit", "exit", "q"}:
            return 0
        if not question:
            continue
        print_answer(assistant.ask(question), show_sources=not args.quiet)


if __name__ == "__main__":
    sys.exit(main())
