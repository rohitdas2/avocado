import json
from pathlib import Path
import unittest

from server.nutrition import rank_foods

# Real USDA result lists (captured from the live API) so ranking is tested on actual descriptions.
FIXTURE = json.loads((Path(__file__).parent / "fixtures/usda_search_names.json").read_text())


def ranked(query, names=None):
    return [food["description"] for food in rank_foods(query, [{"description": name} for name in names or FIXTURE[query]])]


class NutritionRankingTests(unittest.TestCase):
    def test_plain_named_food_comes_first(self):
        self.assertTrue(ranked("avocado")[0].startswith("Avocados, raw"))
        self.assertEqual(ranked("avocado")[-1], "Oil, avocado")
        self.assertEqual(ranked("banana")[0], "Bananas, raw")
        self.assertTrue(ranked("oats")[0].startswith("Oats"))
        self.assertNotIn("Oil, oat", ranked("oats"))

    def test_chicken_breast_prefers_plain_meat_over_breaded_brands_and_deli(self):
        top = ranked("chicken breast")
        self.assertEqual(len(top), 12)
        self.assertTrue(all(name.startswith("Chicken, broiler") for name in top[:6]), top[:6])
        for unwanted in ("breaded", "KFC", "POPEYES", "Fast Foods", "deli", "Turkey"):
            self.assertFalse(any(unwanted in name for name in top[:8]), unwanted)

    def test_naming_the_processed_form_keeps_it(self):
        self.assertEqual(ranked("avocado oil", FIXTURE["avocado"])[0], "Oil, avocado")
        self.assertTrue(ranked("fried chicken breast", FIXTURE["chicken breast"])[0].lower().count("fried"))

    def test_ties_keep_usda_order_and_missing_names_are_safe(self):
        self.assertEqual(ranked("kale", ["Kale, raw", "Kale, raw"]), ["Kale, raw", "Kale, raw"])
        self.assertEqual(len(rank_foods("kale", [{"description": None}, {}])), 2)


if __name__ == "__main__":
    unittest.main()
