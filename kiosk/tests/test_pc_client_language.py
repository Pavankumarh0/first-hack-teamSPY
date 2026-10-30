"""Kannada, Hindi and English questions: map targets and route evidence."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.modules.setdefault("numpy", SimpleNamespace())
import pc_client  # noqa: E402
from server.grounding import grounded_sources  # noqa: E402

ROUTE = {
    "destination": {"name": "Central Library", "where": "engineering old building, floor 1, OB-1"},
    "distanceM": 122, "minutes": 2, "accessible": True,
    "steps": ["Start at Main Gate.", "Walk 57 m to Old building junction."],
}


class MapTargetTests(unittest.TestCase):
    def test_translated_kanglish_and_hinglish_keep_only_the_place(self):
        self.assertEqual(pc_client.map_target("Sir, how do I go to the new building engineering block? Give me the map."),
                         "new building engineering block")
        self.assertEqual(pc_client.map_target("Brother, where is the canteen?"), "canteen")


class RouteEvidenceTests(unittest.TestCase):
    def test_a_natural_route_answer_is_grounded(self):
        hits = [{"source": "campus_map.md", "title": "Central Library", "text": pc_client.route_evidence(ROUTE)}]
        answer = ("The Central Library is located in the engineering old building, floor 1, OB-1. "
                  "It is about a 2 minute walk away, covering a distance of 122 m.")
        self.assertEqual(grounded_sources(answer, hits), ["campus_map.md"])

    def test_a_wrong_distance_is_still_rejected(self):
        hits = [{"source": "campus_map.md", "title": "Central Library", "text": pc_client.route_evidence(ROUTE)}]
        self.assertIsNone(grounded_sources("The Central Library is a 9 minute walk away.", hits))


class LanguageDispatchTests(unittest.TestCase):
    def test_a_spoken_kannada_question_is_answered_in_kannada(self):
        heard = {"text": "ಗ್ರಂಥಾಲಯ ಎಲ್ಲಿದೆ?", "language": "kn", "english": "Where is the library?", "display": "Granthalaya ellide?"}
        reply = {"answer": "...", "sources": []}
        with mock.patch.object(pc_client, "ask_campus_platform", return_value=None) as live, \
             mock.patch.object(pc_client, "ask_text", return_value=reply) as ask, \
             mock.patch.object(pc_client, "deliver"), \
             mock.patch("builtins.print"):     # the test console may not be UTF-8
            pc_client.handle_question("http://x", heard["text"], "t", None, False, False, heard)
        live.assert_called_once_with("http://x", "Where is the library?", "kn")
        ask.assert_called_once_with("http://x", "Where is the library?", "t", "kn")


if __name__ == "__main__":
    unittest.main()
