"""Tests for kiosk/rfid_bridge.py (the PC side of RFID attendance).

    python -m unittest discover -s kiosk/tests -v
"""
import json
import sys
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from rfid_bridge import AttendanceForwarder, mask_uid, parse_kiosk_line  # noqa: E402

KEY = "cmk_" + "k" * 32


def wait_for(forwarder, n, timeout=5.0):
    out, deadline = [], time.time() + timeout
    while len(out) < n and time.time() < deadline:
        out += forwarder.feedback()
        time.sleep(0.01)
    return out


class LineFormat(unittest.TestCase):
    def test_the_firmware_line(self):
        # firmware/src/main.cpp: Serial.printf("RFID:%s age=%lu\n", uid, age)
        self.assertEqual(parse_kiosk_line("RFID:A3:2F:91:0C age=1200"), ("A3:2F:91:0C", 1200))
        self.assertEqual(parse_kiosk_line("RFID:04:5A:1B:2C:3D:80:01 age=0\r"), ("04:5A:1B:2C:3D:80:01", 0))
        self.assertEqual(parse_kiosk_line("RFID:A3:2F:91:0C"), ("A3:2F:91:0C", 0))

    def test_rejects_anything_else(self):
        for bad in ["RFID:a3:2f:91:0c age=1", "RFID:A3:2F:91 age=1", "RFID:A3:2F:91:0C age=-5",
                    "RFID:A3:2F:91:0C;rm -rf", "[esp] rfid: card A3:2F:91:0C", "", "RFID:"]:
            self.assertIsNone(parse_kiosk_line(bad), bad)

    def test_logs_mask_the_uid(self):
        self.assertEqual(mask_uid("A3:2F:91:0C"), "**:**:91:0C")
        self.assertEqual(mask_uid("04:5A:1B:2C:3D:80:01"), "**:**:**:**:**:80:01")


class Forwarding(unittest.TestCase):
    def make(self, responses):
        calls = []

        def post(payload):
            calls.append(payload)
            return responses.pop(0)
        return AttendanceForwarder("http://unused", KEY, post=post, sleep=lambda s: None), calls

    def test_check_in_result_comes_back_for_the_screen(self):
        f, calls = self.make([(201, {"status": "checked_in", "display": "Checked in: Asha"})])
        self.assertTrue(f.submit_line("RFID:A3:2F:91:0C age=1200"))
        self.assertEqual(wait_for(f, 1), [("checked_in", "**:**:91:0C", "Checked in: Asha")])
        self.assertEqual(calls[0]["cardUid"], "A3:2F:91:0C")
        self.assertGreaterEqual(calls[0]["ageMs"], 1200)
        self.assertNotIn("studentId", calls[0])          # the kiosk never names a student
        f.close()

    def test_malformed_lines_are_not_sent(self):
        f, calls = self.make([])
        self.assertFalse(f.submit_line("RFID:nonsense"))
        time.sleep(0.05)
        self.assertEqual(calls, [])
        f.close()

    def test_network_errors_are_retried_then_reported(self):
        f, calls = self.make([(0, {}), (0, {}), (0, {})])
        f.submit_line("RFID:A3:2F:91:0C age=0")
        self.assertEqual(wait_for(f, 1), [("error", "**:**:91:0C", "Attendance offline")])
        self.assertEqual(len(calls), 3)
        f.close()

    def test_a_retry_that_succeeds(self):
        f, calls = self.make([(502, {}), (201, {"status": "checked_in", "display": "Checked in"})])
        f.submit_line("RFID:A3:2F:91:0C age=0")
        self.assertEqual(wait_for(f, 1)[0][0], "checked_in")
        self.assertEqual(len(calls), 2)
        f.close()

    def test_refusals_are_not_retried(self):
        f, calls = self.make([
            (404, {"status": "unknown_card", "display": "Card not registered"}),
            (503, {"status": "disabled", "display": "Attendance is off"}),
            (401, {"error": "Unknown or revoked device key."}),
        ])
        for _ in range(3):
            f.submit_line("RFID:A3:2F:91:0C age=0")
        got = wait_for(f, 3)
        self.assertEqual([g[0] for g in got], ["unknown_card", "disabled", "http_401"])
        self.assertEqual(got[2][2], "Unknown or revoked device key."[:30])
        self.assertEqual(len(calls), 3)
        f.close()

    def test_not_configured(self):
        forwarder, reason = AttendanceForwarder.from_env({})
        self.assertIsNone(forwarder)
        self.assertIn("CAMPUS_KIOSK_KEY", reason)


class OverHttp(unittest.TestCase):
    """The real HTTP request: method, path, headers and body."""

    def test_request_shape(self):
        seen = []

        class Stub(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                seen.append((self.path, self.headers.get("Authorization"), self.headers.get("Content-Type"), body))
                data = json.dumps({"status": "already_checked_in", "display": "Already in: Asha"}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        server = ThreadingHTTPServer(("127.0.0.1", 0), Stub)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            f = AttendanceForwarder(f"http://127.0.0.1:{server.server_address[1]}/", KEY)
            f.submit_line("RFID:A3:2F:91:0C age=50")
            self.assertEqual(wait_for(f, 1)[0], ("already_checked_in", "**:**:91:0C", "Already in: Asha"))
            path, auth, ctype, body = seen[0]
            self.assertEqual(path, "/api/attendance/v1/scan")
            self.assertEqual(auth, f"Bearer {KEY}")
            self.assertEqual(ctype, "application/json")
            self.assertEqual(set(body), {"cardUid", "ageMs"})
            f.close()
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
