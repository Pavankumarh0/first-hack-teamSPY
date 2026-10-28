"""Forwards RFID card taps from the kiosk to the attendance backend.

    UNO Q reader -> ESP32 GPIO16 -> USB -> pc_client.py -> this module
                 -> POST /api/attendance/v1/scan (device key) -> Firestore

The ESP32 prints one line per tap on its USB link (firmware/src/main.cpp):

    RFID:A3:2F:91:0C age=1200

pc_client.py hands those lines to AttendanceForwarder.submit_line(). Requests
run on a background thread, so a slow network never stalls the kiosk; the
short result text ("Checked in: Asha") comes back through feedback(), and
pc_client shows it in the kiosk's title bar with the existing S: command.

Settings (the kiosk PC's environment, or kiosk/.env - git-ignored; copy
kiosk/.env.example). Never in firmware or git:
    CAMPUS_API_URL     the campus website, e.g. https://campus.example.edu
    CAMPUS_KIOSK_KEY   a device key with the "RFID check-ins" capability
                       (Dashboard > Kiosk > Device keys)

The kiosk only says "this card was presented". The backend decides whose card
it is, whether they may check in and for which session. The device key gives
no Firebase access of any kind. Contract: docs/RFID_BACKEND.md.
"""
from __future__ import annotations

import json
import os
import queue
import re
import threading
import time
import urllib.error
import urllib.request

LINE = re.compile(
    r"^RFID:(?P<uid>[0-9A-F]{2}(?::[0-9A-F]{2}){3}|[0-9A-F]{2}(?::[0-9A-F]{2}){6}|[0-9A-F]{2}(?::[0-9A-F]{2}){9})"
    r"(?: age=(?P<age>\d{1,7}))?$"
)


def parse_kiosk_line(line: str):
    """'RFID:A3:2F:91:0C age=1200' -> ('A3:2F:91:0C', 1200); anything else -> None."""
    m = LINE.match(line.strip())
    if not m:
        return None
    return m.group("uid"), int(m.group("age") or 0)


def mask_uid(uid: str) -> str:
    """Shows only the last two bytes in logs: '**:**:91:0C'."""
    parts = uid.split(":")
    return ":".join(["**"] * (len(parts) - 2) + parts[-2:])


class AttendanceForwarder:
    """Posts taps to the backend on a worker thread; never blocks the caller."""

    RETRIES = 3

    def __init__(self, base_url: str, device_key: str, timeout: float = 6.0, post=None, sleep=time.sleep):
        if not base_url or not device_key:
            raise ValueError("CAMPUS_API_URL and CAMPUS_KIOSK_KEY are both required")
        self.url = base_url.rstrip("/") + "/api/attendance/v1/scan"
        self._key = device_key
        self.timeout = timeout
        self._post = post or self._http_post
        self._sleep = sleep
        self._jobs: queue.Queue = queue.Queue(maxsize=64)
        self._results: queue.Queue = queue.Queue()
        self._worker = threading.Thread(target=self._run, name="rfid-attendance", daemon=True)
        self._worker.start()

    @classmethod
    def from_env(cls, environ=None):
        """The forwarder, or None (with the reason) when the kiosk PC is not set up.
        Reads the process environment, after kiosk/.env if that file exists
        (variables already set win)."""
        if environ is None:
            env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
            if os.path.exists(env_file):
                try:
                    from dotenv import load_dotenv
                    load_dotenv(env_file, override=False)
                except ImportError:
                    pass
            environ = os.environ
        # Off unless asked for: the same URL and key also serve the kiosk API.
        if environ.get("RFID_ATTENDANCE", "").strip().lower() not in ("on", "1", "true", "yes"):
            return None, "RFID attendance is turned off (RFID_ATTENDANCE=on enables it)"
        url, key = environ.get("CAMPUS_API_URL", ""), environ.get("CAMPUS_KIOSK_KEY", "")
        if not url or not key:
            return None, "set CAMPUS_API_URL and CAMPUS_KIOSK_KEY to record attendance"
        return cls(url, key), None

    # --- called from pc_client's loop ---------------------------------------

    def submit_line(self, line: str) -> bool:
        """Queues the tap in an 'RFID:...' line. False if the line is malformed."""
        parsed = parse_kiosk_line(line)
        if not parsed:
            return False
        uid, age = parsed
        try:
            self._jobs.put_nowait((uid, age, time.monotonic()))
        except queue.Full:
            self._results.put(("error", mask_uid(uid), "Attendance busy"))
        return True

    def feedback(self):
        """[(status, masked uid, text for the kiosk), ...] finished since the last call."""
        out = []
        while True:
            try:
                out.append(self._results.get_nowait())
            except queue.Empty:
                return out

    def close(self, wait: float = 5.0):
        """Lets queued taps finish (up to `wait` seconds)."""
        self._jobs.put(None)
        self._worker.join(wait)

    # --- worker ---------------------------------------------------------------

    def _run(self):
        while True:
            job = self._jobs.get()
            if job is None:
                return
            uid, age, queued_at = job
            masked = mask_uid(uid)
            for attempt in range(self.RETRIES):
                # The kiosk's own queue time plus ours, so the record says how late it arrived.
                age_now = age + int((time.monotonic() - queued_at) * 1000)
                status, body = self._post({"cardUid": uid, "ageMs": min(age_now, 600_000)})
                if status == 0 or (status >= 500 and body.get("status") != "disabled"):
                    if attempt + 1 < self.RETRIES:
                        self._sleep(2 ** attempt * 2)       # 2 s, 4 s
                        continue
                    self._results.put(("error", masked, "Attendance offline"))
                    break
                text = body.get("display") or body.get("error") or f"HTTP {status}"
                self._results.put((body.get("status", f"http_{status}"), masked, text[:30]))
                break

    def _http_post(self, payload: dict):
        req = urllib.request.Request(
            self.url, data=json.dumps(payload).encode("utf-8"), method="POST",
            headers={"Authorization": f"Bearer {self._key}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                return res.status, json.loads(res.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as err:
            try:
                return err.code, json.loads(err.read().decode("utf-8") or "{}")
            except ValueError:
                return err.code, {}
        except (urllib.error.URLError, TimeoutError, OSError):
            return 0, {}
