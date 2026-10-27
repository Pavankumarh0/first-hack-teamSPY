"""Contract tests for kiosk/campus_api_client.py against a local stub server.

    python -m unittest discover -s kiosk/tests -v

The stub answers like apps/campus_web/src/app/api/kiosk/v1 (the shapes in
kiosk/API_CONTRACT.md); the end-to-end run against the real website is in
docs/TESTING.md.
"""
import json
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from campus_api_client import CampusApi, CampusApiError, kiosk_screen_lines  # noqa: E402

KEY = "cmk_" + "x" * 32
DIRECTIONS = {
    "destination": {"kind": "location", "id": "library-reading-hall", "name": "Library Reading Hall", "where": "Central Library, floor 0, LIB-G"},
    "distanceM": 148, "minutes": 2, "accessible": True,
    "steps": ["Start at Administrative Block entrance.", "Walk 38 m to Fountain circle (fountain).",
              "Turn left and walk 68 m to Central lawn junction (central lawn).", "Turn right and walk 43 m to Library entrance.",
              "You have arrived at Library entrance."],
    "summary": "Library Reading Hall (Central Library, floor 0, LIB-G): about 2 min walk, 148 m.",
    "qrUrl": "https://campus.example.edu/campus/route?from=admin-lobby-kiosk&to=library-reading-hall",
}


class Stub(BaseHTTPRequestHandler):
    seen = []

    def log_message(self, *args):
        pass

    def do_GET(self):
        url = urlparse(self.path)
        Stub.seen.append((url.path, parse_qs(url.query), self.headers.get("Authorization")))
        if self.headers.get("Authorization") != f"Bearer {KEY}":
            return self._send(401, {"error": "Missing or malformed device key."})
        if url.path == "/api/kiosk/v1/directions":
            if parse_qs(url.query).get("to") == ["nowhere"]:
                return self._send(404, {"error": "That place is not on the campus map."})
            return self._send(200, DIRECTIONS)
        if url.path == "/api/kiosk/v1/search":
            return self._send(200, {"query": "bus pass", "results": [{"kind": "location", "id": "transport-office", "name": "Transport Office"}]})
        return self._send(404, {"error": "not found"})

    def _send(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


class ClientTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Stub)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def test_directions_send_the_key_and_parameters(self):
        d = CampusApi(self.base, KEY).directions("library-reading-hall", from_="main-canteen", step_free=True)
        self.assertEqual(d["minutes"], 2)
        path, query, auth = Stub.seen[-1]
        self.assertEqual(path, "/api/kiosk/v1/directions")
        self.assertEqual(query, {"to": ["library-reading-hall"], "from": ["main-canteen"], "accessible": ["1"]})
        self.assertEqual(auth, f"Bearer {KEY}")

    def test_search(self):
        self.assertEqual(CampusApi(self.base, KEY).search("bus pass")[0]["id"], "transport-office")

    def test_errors_carry_the_server_message(self):
        with self.assertRaises(CampusApiError) as e:
            CampusApi(self.base, KEY).directions("nowhere")
        self.assertEqual(e.exception.status, 404)
        self.assertIn("not on the campus map", e.exception.message)
        with self.assertRaises(CampusApiError) as e:
            CampusApi(self.base, "cmk_wrong_key_wrong_key_wrong_key").config()
        self.assertEqual(e.exception.status, 401)

    def test_missing_settings_are_explained(self):
        with self.assertRaises(CampusApiError):
            CampusApi("", KEY)
        with self.assertRaises(CampusApiError):
            CampusApi(self.base, "")

    def test_unreachable_server(self):
        with self.assertRaises(CampusApiError) as e:
            CampusApi("http://127.0.0.1:9", KEY, timeout=1).config()
        self.assertEqual(e.exception.status, 0)

    def test_kiosk_screen_lines_are_single_line_ascii(self):
        q, r, a = kiosk_screen_lines(DIRECTIONS)
        self.assertEqual(q, "Way to Library Reading Hall")
        self.assertEqual(r, "campus map")
        for text in (q, r, a):
            self.assertNotIn("\n", text)
            self.assertTrue(all(32 <= ord(c) <= 126 for c in text))
        self.assertIn("1. Walk 38 m", a)
        self.assertIn(DIRECTIONS["qrUrl"], a)
        self.assertLessEqual(len(a), 590)   # firmware MAX_LINE is 600


if __name__ == "__main__":
    unittest.main()
