import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import language  # noqa: E402


class LanguageTests(unittest.TestCase):
    def test_reply_language_follows_the_enabled_languages(self):
        with mock.patch.dict(os.environ, {"KIOSK_LANGUAGES": "en,kn,hi"}):
            self.assertEqual(language.reply_language("kn-IN"), "kn")
            self.assertEqual(language.reply_language("hi-IN"), "hi")
            self.assertEqual(language.reply_language("ta-IN"), "en")     # not enabled: English
            self.assertEqual(language.reply_language(None), "en")
        with mock.patch.dict(os.environ, {"KIOSK_LANGUAGES": "en,kn"}):
            self.assertEqual(language.reply_language("hi-IN"), "en")

    def test_spoken_source_names_stay_english(self):
        self.assertEqual(language.spoken_suffix("en", ["05_hostel.md"]), " This is from the hostel information.")
        self.assertIn("campus map", language.spoken_suffix("kn", ["campus_map.md"]))
        self.assertEqual(language.spoken_suffix("hi", []), "")

    def test_english_needs_no_translation(self):
        import asyncio
        out = asyncio.run(language.understand("Where is the library?", "en-IN"))
        self.assertEqual((out["language"], out["english"]), ("en", "Where is the library?"))


if __name__ == "__main__":
    unittest.main()
