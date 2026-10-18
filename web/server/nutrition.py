import json
import math
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen


class NutritionError(Exception):
    pass


def normalize_food(food):
    def nutrient(*ids):
        for nutrient_id in ids:
            for item in food.get("foodNutrients", []):
                value = item.get("value")
                if item.get("nutrientId") == nutrient_id and type(value) in (int, float) and math.isfinite(value) and value >= 0:
                    return value
        return None
    return {"id": food.get("fdcId"), "name": food.get("description"), "calories": nutrient(1008, 2048, 2047), "protein": nutrient(1003), "carbs": nutrient(1005), "fat": nutrient(1004)}


def search_foods(query):
    url = "https://api.nal.usda.gov/fdc/v1/foods/search?" + urlencode({"api_key": os.getenv("USDA_API_KEY", "DEMO_KEY"), "query": query, "dataType": "SR Legacy", "pageSize": 12})
    try:
        with urlopen(url, timeout=10) as response:
            return [normalize_food(food) for food in json.load(response).get("foods", [])]
    except HTTPError as error:
        if error.code == 429:
            raise NutritionError("Nutrition search limit reached. Try later or configure a USDA API key.") from None
        raise NutritionError("Nutrition search is unavailable. You can still add food manually.") from None
    except (TimeoutError, URLError, ValueError, KeyError, TypeError):
        raise NutritionError("Nutrition search is unavailable. You can still add food manually.") from None
