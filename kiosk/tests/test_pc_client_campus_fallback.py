"""Campus API outages must fall through to the local Gemma + RAG endpoint."""
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
# These tests exercise the text/API dispatch only; audio code never uses NumPy.
# The kiosk runtime installs NumPy, while minimal test environments may not.
sys.modules.setdefault("numpy", SimpleNamespace())
import pc_client  # noqa: E402


class CampusFallbackTests(unittest.TestCase):
    def test_missing_live_api_settings_fall_through(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with mock.patch("builtins.print"):
                self.assertIsNone(pc_client.ask_campus_platform("http://localhost:8000", "Where is the library?"))

    def test_live_api_failure_falls_through(self):
        def unavailable(*_args, **_kwargs):
            raise OSError("website is unreachable")

        fake_module = SimpleNamespace(CampusApi=unavailable)
        settings = {"CAMPUS_API_URL": "https://campus.example.edu", "CAMPUS_KIOSK_KEY": "cmk_test"}
        with mock.patch.dict(os.environ, settings, clear=True), \
             mock.patch.dict(sys.modules, {"campus_api_client": fake_module}), \
             mock.patch("builtins.print"):
            self.assertIsNone(pc_client.ask_campus_platform("http://localhost:8000", "Where is the library?"))

    def test_question_handler_calls_local_rag_after_live_lookup_fails(self):
        grounded = {"question": "Where is the library?", "answer": "The library is in the Central Block.", "sources": ["01_campus.md"]}
        with mock.patch.object(pc_client, "ask_campus_platform", return_value=None), \
             mock.patch.object(pc_client, "ask_text", return_value=grounded) as ask_rag, \
             mock.patch.object(pc_client, "deliver") as deliver:
            pc_client.handle_question("http://localhost:8000", "Where is the library?", "test", None, False, False)
        ask_rag.assert_called_once_with("http://localhost:8000", "Where is the library?", "test")
        deliver.assert_called_once_with(grounded, "http://localhost:8000", None, False, False)


if __name__ == "__main__":
    unittest.main()
