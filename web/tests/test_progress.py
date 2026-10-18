import unittest

from server.progress import estimated_one_rep_max, suggest_next, summarize_sets


class ProgressMathTests(unittest.TestCase):
    def test_summary_uses_heaviest_set_and_mixed_units(self):
        sets = [{"reps": 10, "weight": 95, "unit": "lb"}, {"reps": 5, "weight": 70, "unit": "kg"}, {"reps": 8, "weight": 135, "unit": "lb"}]
        summary = summarize_sets(sets)
        self.assertEqual(summary["topSet"], {"reps": 5, "weight": 70, "unit": "kg"})
        self.assertAlmostEqual(summary["e1rmKg"], round(70 * (1 + 5 / 30), 2))
        self.assertEqual(summary["maxReps"], 10)
        self.assertEqual(estimated_one_rep_max(100, 1), 100)

    def test_double_progression_ignores_warmups(self):
        sets = [{"reps": 10, "weight": 95, "unit": "lb"}] + [{"reps": reps, "weight": 135, "unit": "lb"} for reps in (8, 8, 7)]
        suggestion = suggest_next(sets)
        self.assertEqual(suggestion["same"], {"weight": 135, "unit": "lb", "reps": 7, "sets": 3})
        self.assertEqual([(o["kind"], o["weight"], o["reps"]) for o in suggestion["options"]], [("weight", 140, 7), ("reps", 135, 8)])
        self.assertEqual(suggest_next([{"reps": 5, "weight": 60, "unit": "kg"}])["options"][0]["weight"], 62.5)

    def test_bodyweight_only_adds_reps(self):
        suggestion = suggest_next([{"reps": 12, "weight": 0, "unit": "lb"}] * 2)
        self.assertEqual([(o["kind"], o["reps"]) for o in suggestion["options"]], [("reps", 13)])
        self.assertIsNone(suggest_next([]))


if __name__ == "__main__":
    unittest.main()
