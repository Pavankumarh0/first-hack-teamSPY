"""Campus Mithra HTTP bridge for the ESP32 kiosk.

The ESP32 has nowhere near enough memory to run embeddings or a language model, so
it acts as the microphone, screen and speaker while this server does the thinking.
Only the Python standard library is used here, so there is no extra dependency and
no framework to configure.

Run on the laptop that shares a Wi-Fi network with the ESP32:

    python server.py                 listen on 0.0.0.0:8080
    python server.py --port 5000

Endpoints
---------
GET  /health                     -> {"status": "ok"}
GET  /info                       -> configuration and knowledge base stats
GET  /ask?q=<question>           -> JSON answer
GET  /ask?q=<question>&format=text
                                 -> plain text, one field per line, easiest to
                                    parse on the ESP32 with readStringUntil()
POST /ask  {"question": "..."}   -> JSON answer

The JSON answer carries a "lines" array already wrapped to TFT_COLUMNS characters,
so the firmware can print it row by row without doing any text layout.
"""

from __future__ import annotations

import argparse
import json
import textwrap
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from campus_mithra import CampusMithra, config

# A 320x240 ILI9341 in landscape fits 26 characters per line at font size 2,
# and 18 lines of 12 pixel height with room for a header and a footer.
TFT_COLUMNS = 26
TFT_ROWS = 14

assistant: CampusMithra | None = None


def wrap_for_display(text: str) -> list[str]:
    """Wrap an answer into lines that fit the 2.8 inch TFT."""
    lines = textwrap.wrap(text, width=TFT_COLUMNS) or [""]
    if len(lines) > TFT_ROWS:
        lines = lines[:TFT_ROWS]
        lines[-1] = lines[-1][: TFT_COLUMNS - 3] + "..."
    return lines


def answer_payload(question: str) -> dict[str, object]:
    assert assistant is not None
    result = assistant.ask(question)
    payload = result.to_dict()
    payload["lines"] = wrap_for_display(result.speech_text())
    payload["ok"] = result.error is None
    return payload


def text_payload(payload: dict[str, object]) -> str:
    """Flat key:value form for the ESP32, terminated by END."""
    rows = [
        f"STATUS:{'OK' if payload['ok'] else 'ERROR'}",
        f"GROUNDED:{'1' if payload['grounded'] else '0'}",
        f"SCORE:{payload['top_score']}",
        f"BLOCKED:{payload['blocked_by'] or '-'}",
        f"ANSWER:{payload['speech']}",
    ]
    rows += [f"LINE:{line}" for line in payload["lines"]]
    rows.append("END")
    return "\n".join(rows) + "\n"


class Handler(BaseHTTPRequestHandler):
    server_version = "CampusMithra/1.0"
    protocol_version = "HTTP/1.1"

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, data: dict) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self._send(status, body, "application/json; charset=utf-8")

    def _text(self, status: int, data: str) -> None:
        self._send(status, data.encode("utf-8"), "text/plain; charset=utf-8")

    def log_message(self, fmt: str, *args) -> None:
        print(f"[{self.address_string()}] {fmt % args}")

    # ------------------------------------------------------------------ #
    # Routes
    # ------------------------------------------------------------------ #

    def do_GET(self) -> None:  # noqa: N802 - name fixed by BaseHTTPRequestHandler
        route = urlparse(self.path)
        query = parse_qs(route.query)

        if route.path in ("/health", "/"):
            self._json(200, {"status": "ok", "assistant": config.ASSISTANT_NAME})
            return

        if route.path == "/info":
            assert assistant is not None
            self._json(200, assistant.info())
            return

        if route.path == "/ask":
            question = (query.get("q") or query.get("question") or [""])[0]
            if not question.strip():
                self._json(400, {"ok": False, "error": "missing q parameter"})
                return
            payload = answer_payload(question)
            if (query.get("format") or [""])[0] == "text":
                self._text(200, text_payload(payload))
            else:
                self._json(200, payload)
            return

        self._json(404, {"ok": False, "error": f"unknown path {route.path}"})

    def do_POST(self) -> None:  # noqa: N802
        route = urlparse(self.path)
        if route.path != "/ask":
            self._json(404, {"ok": False, "error": f"unknown path {route.path}"})
            return

        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length).decode("utf-8", errors="replace") if length else ""
        question = ""
        if raw:
            try:
                question = (json.loads(raw).get("question") or "").strip()
            except json.JSONDecodeError:
                question = raw.strip()

        if not question:
            self._json(400, {"ok": False, "error": "missing question"})
            return
        self._json(200, answer_payload(question))

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()


def local_ip() -> str:
    """Best guess at the LAN address the ESP32 should be pointed at."""
    import socket

    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 80))
        return probe.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        probe.close()


def main() -> int:
    global assistant

    parser = argparse.ArgumentParser(description="Campus Mithra HTTP bridge")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()

    print("Loading Campus Mithra ...")
    assistant = CampusMithra.load()
    stats = assistant.info()
    print(f"Ready. {stats['chunks']} chunks, model {stats['gemma_model']}")

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    address = local_ip()
    print(f"\nServing on http://{address}:{args.port}")
    print(f"Point the ESP32 at:  http://{address}:{args.port}/ask?q=...&format=text")
    print("Press Ctrl+C to stop.\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
