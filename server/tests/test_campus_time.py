import unittest
from datetime import datetime, timezone

from server.campus_time import campus_today


class CampusTimeTests(unittest.TestCase):
    def test_utc_date_rolls_over_to_india_date(self):
        now = datetime(2026, 10, 28, 20, 0, tzinfo=timezone.utc)
        self.assertEqual(campus_today(now), "2026-10-29")

    def test_naive_datetime_is_treated_as_utc(self):
        now = datetime(2026, 10, 28, 20, 0)
        self.assertEqual(campus_today(now), "2026-10-29")


if __name__ == "__main__":
    unittest.main()
