"""Runs pc_client.run_button_mode() - the real kiosk loop - with a fake ESP32
link, to check that RFID lines reach the attendance backend and the result
comes back to the kiosk screen, while the button/mic protocol carries on.

    python -m unittest discover -s kiosk/tests -v
"""
import json
import os
import sys
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
try:
    import pc_client  # noqa: E402  (needs numpy, as on the kiosk PC)
except ImportError as exc:  # pragma: no cover
    pc_client = None
    SKIP = f"pc_client not importable here: {exc}"
else:
    SKIP = ""


class FakeEsp:
    """Plays a script of ESP32 events, then ends the loop like Ctrl+C."""

    def __init__(self, events, stop_when):
        self.events = list(events)
        self.stop_when = stop_when
        self.sent = []
        self.deadline = time.time() + 10          # a broken loop fails, it doesn't hang

    def next_event(self, timeout=0.2):
        if self.events:
            return self.events.pop(0)
        if self.stop_when(self) or time.time() > self.deadline:
            raise KeyboardInterrupt
        time.sleep(0.02)
        return None

    def status(self, text): self.sent.append(("S", text))
    def heartbeat(self): self.sent.append(("HB", ""))
    def idle(self): self.sent.append(("IDLE", ""))


@unittest.skipIf(pc_client is None, SKIP)
class ButtonLoopForwardsTaps(unittest.TestCase):
    def setUp(self):
        self.posts = []
        posts = self.posts

        class Backend(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                posts.append((self.path, self.headers.get("Authorization"), body))
                data = json.dumps({"status": "checked_in", "display": "Checked in: Asha"}).encode()
                self.send_response(201)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Backend)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def run_loop(self, events, env, stop_when):
        esp = FakeEsp(events, stop_when)
        with mock.patch.dict(os.environ, env, clear=False), mock.patch("builtins.print"):
            pc_client.run_button_mode("http://unused", esp, None)
        return esp

    def test_tap_is_recorded_and_shown(self):
        env = {"RFID_ATTENDANCE": "on", "CAMPUS_API_URL": f"http://127.0.0.1:{self.server.server_address[1]}",
               "CAMPUS_KIOSK_KEY": "cmk_" + "k" * 32}
        events = [
            ("line", "[esp] rfid: card A3:2F:91:0C"),
            ("line", "RFID:A3:2F:91:0C age=800"),
            ("line", "RFID:garbage"),                    # ignored, never posted
        ]
        esp = self.run_loop(events, env, lambda e: ("S", "Checked in: Asha") in e.sent)
        self.assertEqual(len(self.posts), 1)
        path, auth, body = self.posts[0]
        self.assertEqual(path, "/api/attendance/v1/scan")
        self.assertEqual(auth, "Bearer cmk_" + "k" * 32)
        self.assertEqual(body["cardUid"], "A3:2F:91:0C")
        self.assertIn(("S", "Checked in: Asha"), esp.sent)

    def test_switched_off_nothing_is_sent(self):
        # Kiosk API settings present, but RFID attendance is off (the default).
        env = {"RFID_ATTENDANCE": "", "CAMPUS_API_URL": f"http://127.0.0.1:{self.server.server_address[1]}",
               "CAMPUS_KIOSK_KEY": "cmk_" + "k" * 32}
        esp = self.run_loop([("line", "RFID:A3:2F:91:0C age=0")], env,
                            lambda e: ("S", "Attendance not set up") in e.sent)
        self.assertEqual(self.posts, [])
        self.assertIn(("S", "Attendance not set up"), esp.sent)

    def test_without_settings_nothing_is_sent(self):
        env = {"RFID_ATTENDANCE": "on", "CAMPUS_API_URL": "", "CAMPUS_KIOSK_KEY": ""}
        esp = self.run_loop([("line", "RFID:A3:2F:91:0C age=0")], env,
                            lambda e: ("S", "Attendance not set up") in e.sent)
        self.assertEqual(self.posts, [])
        self.assertIn(("S", "Attendance not set up"), esp.sent)


if __name__ == "__main__":
    unittest.main()
