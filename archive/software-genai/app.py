"""Campus Mithra - Gradio web interface.

Run from the software folder:

    python app.py

Then open http://127.0.0.1:7860 in the browser.
"""

from __future__ import annotations

import gradio as gr

from campus_mithra import CampusMithra, config

CSS = """
.cm-header { text-align:center; padding: 18px 8px 4px; }
.cm-header h1 { margin:0; font-size:2.1rem; letter-spacing:-0.5px;
  background: linear-gradient(90deg,#f59e0b,#ef4444,#8b5cf6);
  -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
.cm-header p { margin:6px 0 0; opacity:.75; font-size:.95rem; }
footer { display:none !important; }
"""

EXAMPLES = [
    "What is the hostel fee for an AC double sharing room?",
    "Which companies came for placements last year?",
    "How do I reach the college from Jayanagar by college bus?",
    "What is the tuition fee under KCET government quota?",
    "Is there parking for parents who come to visit?",
    "What food does the canteen serve and what does a meal cost?",
    "Who is the head of the Computer Science department?",
    "What are the library timings?",
    "What is the weather in Bengaluru today?",
]

print("Loading Campus Mithra ...")
assistant = CampusMithra.load()
info = assistant.info()
print(f"Ready. {info['chunks']} chunks, model {info['gemma_model']}")


def respond(message: str, history: list[dict]) -> tuple[str, str]:
    """Return (answer, retrieval detail) for one question."""
    result = assistant.ask(message)

    if result.error:
        detail = f"**Setup problem**\n\n{result.error}"
    else:
        blocked = {
            "floor": f"guard 1, floor — nothing matched (< {config.MIN_SIMILARITY})",
            "off_topic": "guard 2 — looks like a non-college question",
            "model": "guard 3 — the answer is not in the retrieved passages",
            "api": "the Gemma call failed",
        }.get(result.blocked_by or "", None)

        lines = [
            f"**KB score:** {result.top_score:.3f}  |  "
            f"**Off-topic score:** {result.off_topic_score:.3f}  |  "
            f"**Latency:** {result.latency_ms} ms  |  "
            f"**Grounded:** {'yes' if result.grounded else 'no'}",
        ]
        if blocked:
            lines.append(f"\n**Refused by:** {blocked}")
        lines += ["", "**Retrieved passages**"]
        if result.passages:
            for position, chunk in enumerate(result.passages, start=1):
                snippet = chunk.body[:260] + ("..." if len(chunk.body) > 260 else "")
                lines.append(f"{position}. `{chunk.citation()}` - score {chunk.score:.3f}")
                lines.append(f"   > {snippet}")
        else:
            lines.append("_none_")
        detail = "\n".join(lines)

    return result.answer, detail


def on_submit(message: str, history: list[dict]):
    if not (message or "").strip():
        return history, "", ""
    answer, detail = respond(message, history)
    history = (history or []) + [
        {"role": "user", "content": message},
        {"role": "assistant", "content": answer},
    ]
    return history, "", detail


with gr.Blocks(title="Campus Mithra", theme=gr.themes.Soft(), css=CSS) as demo:
    gr.HTML(
        "<div class='cm-header'><h1>Campus Mithra</h1>"
        f"<p>AI campus assistant for {config.COLLEGE_NAME} &mdash; "
        "answers only from the official college knowledge base</p></div>"
    )

    with gr.Row():
        with gr.Column(scale=3):
            chat = gr.Chatbot(
                label="Ask about the college",
                type="messages",
                height=430,
            )
            with gr.Row():
                box = gr.Textbox(
                    placeholder="e.g. What is the hostel fee for a triple sharing room?",
                    show_label=False,
                    scale=8,
                    autofocus=True,
                )
                send = gr.Button("Ask", variant="primary", scale=1)
                clear = gr.Button("Clear", scale=1)
            gr.Examples(examples=EXAMPLES, inputs=box, label="Try these")

        with gr.Column(scale=2):
            detail_box = gr.Markdown(
                "Retrieval details appear here after each question."
            )
            gr.Markdown(
                "### Configuration\n"
                f"- Gemma model: `{info['gemma_model']}`\n"
                f"- Embeddings: `{info['embedding_model']}`\n"
                f"- Chunk size / overlap: `{info['chunk_size']} / {info['chunk_overlap']}` words\n"
                f"- Top K: `{info['top_k']}`  |  Temperature: `{info['temperature']}`\n"
                f"- Floor: `{info['min_similarity']}`  |  "
                f"Off-topic margin: `{info['off_topic_margin']}`\n"
                f"- Knowledge base: `{info['chunks']}` chunks, "
                f"`{len(info['documents'])}` documents\n"
                f"- API key loaded: `{info['api_key_present']}`"
            )

    send.click(on_submit, [box, chat], [chat, box, detail_box])
    box.submit(on_submit, [box, chat], [chat, box, detail_box])
    clear.click(lambda: ([], "", ""), None, [chat, box, detail_box])


if __name__ == "__main__":
    demo.launch(server_name="127.0.0.1", server_port=7860, inbrowser=True)
