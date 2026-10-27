"""Read-only client for the Campus Mithra kiosk API (kiosk/API_CONTRACT.md).

Runs on the kiosk PC, next to pc_client.py - never on the ESP32. The ESP32
firmware keeps doing what it does today; this client fetches published campus
data from the platform and can show it on the kiosk screen through the
commands the firmware already understands (Q:, R:, A:).

    export CAMPUS_API_URL=https://campus.example.edu      # the website
    export CAMPUS_KIOSK_KEY=cmk_...                       # Dashboard > Kiosk > Device keys

    python kiosk/campus_api_client.py config
    python kiosk/campus_api_client.py announcements
    python kiosk/campus_api_client.py events
    python kiosk/campus_api_client.py search "bus pass"
    python kiosk/campus_api_client.py directions library-reading-hall [--from main-canteen] [--step-free]
    python kiosk/campus_api_client.py directions library-reading-hall --show-on-kiosk COM9

The key is a device secret: keep it in the kiosk PC's environment or .env,
never in firmware or a repository. Only the standard library is needed
(--show-on-kiosk also needs pyserial, as pc_client.py does).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


class CampusApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(f"{message} (HTTP {status})" if status else message)
        self.status = status
        self.message = message


class CampusApi:
    """The kiosk API: published campus data only, authenticated with a device key."""

    def __init__(self, base_url: str, device_key: str, timeout: float = 6.0):
        if not base_url:
            raise CampusApiError(0, "CAMPUS_API_URL is not set (the campus website, e.g. https://campus.example.edu).")
        if not device_key:
            raise CampusApiError(0, "CAMPUS_KIOSK_KEY is not set (Dashboard > Kiosk > Device keys).")
        self.base_url = base_url.rstrip("/")
        self._key = device_key
        self.timeout = timeout

    def _get(self, path: str, **params) -> dict:
        query = urllib.parse.urlencode({k: v for k, v in params.items() if v not in (None, "", False)})
        url = f"{self.base_url}/api/kiosk/v1/{path}" + (f"?{query}" if query else "")
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {self._key}", "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                return json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as err:
            try:
                message = json.loads(err.read().decode("utf-8")).get("error", err.reason)
            except Exception:
                message = str(err.reason)
            raise CampusApiError(err.code, message) from None
        except urllib.error.URLError as err:
            raise CampusApiError(0, f"cannot reach {self.base_url}: {err.reason}") from None

    def config(self) -> dict:
        return self._get("config")

    def announcements(self, limit: int | None = None) -> list[dict]:
        return self._get("announcements", limit=limit)["announcements"]

    def events(self, limit: int | None = None) -> list[dict]:
        return self._get("events", limit=limit)["events"]

    def search(self, query: str) -> list[dict]:
        return self._get("search", q=query)["results"]

    def directions(self, to: str, from_: str | None = None, step_free: bool = False) -> dict:
        return self._get("directions", to=to, **{"from": from_}, accessible="1" if step_free else None)


def kiosk_screen_lines(d: dict) -> tuple[str, str, str]:
    """(question, source, answer) for the kiosk TFT: Q:, R: and A: lines.

    The API already returns plain ASCII (the TFT font has nothing else), and
    pc_client sends one line per command, so everything is single-line text.
    """
    question = f"Way to {d['destination']['name']}"
    source = "campus map"
    steps = " ".join(f"{i}. {s}" for i, s in enumerate(d["steps"][1:-1], 1))
    answer = f"{d['summary']} {steps} Scan the QR code on your phone: {d['qrUrl']}"
    return question, source, answer[:590]


def show_on_kiosk(port: str, d: dict) -> None:
    """Shows directions on the kiosk screen using commands the firmware already has."""
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from pc_client import connect_esp32  # noqa: E402 - only needed for this option

    link = connect_esp32(port)
    if link is None:
        raise SystemExit("Could not reach the kiosk. Close pc_client.py / any serial monitor and check the port.")
    q, r, a = kiosk_screen_lines(d)
    link.question(q)
    link.source(r)   # firmware: R: must come before A:
    link.answer(a)
    link.close()


def _print(obj) -> None:
    print(json.dumps(obj, indent=2, ensure_ascii=False))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Campus Mithra kiosk API client (read-only)")
    ap.add_argument("--url", default=os.getenv("CAMPUS_API_URL", ""), help="campus website base URL (or CAMPUS_API_URL)")
    ap.add_argument("--key", default=os.getenv("CAMPUS_KIOSK_KEY", ""), help="device key (prefer the CAMPUS_KIOSK_KEY variable)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("config")
    sub.add_parser("announcements").add_argument("--limit", type=int)
    sub.add_parser("events").add_argument("--limit", type=int)
    sub.add_parser("search").add_argument("query")
    d = sub.add_parser("directions")
    d.add_argument("to", help="place id, from search results")
    d.add_argument("--from", dest="from_", help="start place id (default: where the kiosk stands)")
    d.add_argument("--step-free", action="store_true")
    d.add_argument("--show-on-kiosk", metavar="PORT", help="also show the result on the kiosk screen (e.g. COM9)")
    args = ap.parse_args(argv)

    try:
        api = CampusApi(args.url, args.key)
        if args.cmd == "config":
            _print(api.config())
        elif args.cmd == "announcements":
            _print(api.announcements(args.limit))
        elif args.cmd == "events":
            _print(api.events(args.limit))
        elif args.cmd == "search":
            _print(api.search(args.query))
        elif args.cmd == "directions":
            result = api.directions(args.to, args.from_, args.step_free)
            _print(result)
            if args.show_on_kiosk:
                show_on_kiosk(args.show_on_kiosk, result)
    except CampusApiError as err:
        print(f"error: {err}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
