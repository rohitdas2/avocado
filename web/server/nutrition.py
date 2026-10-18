import json
import math
import os
import re
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


# USDA orders by text match, so "oats" returns "Oil, oat" first and "chicken breast" returns breaded
# tenders before plain breast. We fetch a larger page (still one request against the rate limit)
# and re-rank it so the plain, named food comes first. Scores are additive; ties keep USDA order.
PAGE_SIZE = 50
RESULTS = 12
# Forms that are rarely what someone searching a plain food wants, unless the query names them.
PROCESSED = ("oil", "breaded", "breading", "batter", "fried", "fast foods", "babyfood", "beverages", "ready-to-eat",
             "formulated bar", "breakfast bars", "spread", "meatless", "frankfurter", "fat")
# Deli or flavored versions: still the food, but less likely the one meant.
PREPARED = ("roll", "deli", "sliced", "prepackaged", "glazed", "flavor", "seasoned", "with added solution", "dehydrated", "powder")
PLAIN_COOKING = ("cooked", "roasted", "grilled", "boiled", "baked", "steamed", "dry", "braised")


def stem(word):
    """Crude singular form so 'oats'/'oat' and 'avocados'/'avocado' compare equal."""
    word = re.sub(r"[^a-z]", "", word.lower())
    if len(word) > 4 and (word.endswith("oes") or word[-3:] in ("ses", "xes", "zes")):
        return word[:-2]
    if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def relevance(query, name):
    lowered = name.lower()
    query_words = [word for word in re.findall(r"[a-z]+", query.lower())]
    words = re.findall(r"[A-Za-z'-]+", name)
    word_set = {word.lower().strip("'") for word in words}
    stem_set = {stem(part) for word in words for part in word.split("-")}
    score = 0
    if query_words and all(stem(word) in stem_set for word in query_words):
        score += 4  # every query word appears as a whole word (any plural form)
    score += 1 if query_words and all(word in word_set for word in query_words) else 0  # exact wording
    # The food is named for the query: the first comma part, ignoring "(...)" notes, is the query
    # ("Avocados, raw", "Oats (Includes …)") rather than "Oil, avocado"; starting with it counts less.
    head = [stem(word) for word in re.findall(r"[a-z]+", re.sub(r"\(.*?\)", "", lowered.split(",")[0]))]
    wanted = [stem(word) for word in query_words]
    if head and wanted and head == wanted:
        score += 3
    elif head and wanted and (head[:len(wanted)] == wanted or wanted[:len(head)] == head):
        score += 1  # "Oat bran" for "oats", or USDA's "Chicken, …, breast" for "chicken breast"
    segments = [segment.strip() for segment in lowered.split(",")]
    if "raw" in segments:
        score += 2
    elif any(word in lowered for word in PLAIN_COOKING):
        score += 1
    in_query = lambda marker: marker in query.lower()
    if any(re.search(rf"(^|[^a-z]){re.escape(marker)}([^a-z]|$)", lowered) and not in_query(marker) for marker in PROCESSED):
        score -= 5
    if any(marker in lowered and not in_query(marker) for marker in PREPARED):
        score -= 3
    if any(len(word) >= 3 and word.isupper() for word in words):
        score -= 3  # brand or restaurant names (QUAKER, KFC) in SR Legacy descriptions
    return score


def rank_foods(query, foods):
    """Stable sort by relevance, then shorter (plainer) descriptions; keep the top RESULTS."""
    ordered = sorted(enumerate(foods), key=lambda pair: (-relevance(query, pair[1].get("description") or ""), len(pair[1].get("description") or ""), pair[0]))
    return [food for _, food in ordered][:RESULTS]


def search_foods(query):
    url = "https://api.nal.usda.gov/fdc/v1/foods/search?" + urlencode({"api_key": os.getenv("USDA_API_KEY", "DEMO_KEY"), "query": query, "dataType": "SR Legacy", "pageSize": PAGE_SIZE})
    try:
        with urlopen(url, timeout=10) as response:
            return [normalize_food(food) for food in rank_foods(query, json.load(response).get("foods", []))]
    except HTTPError as error:
        if error.code == 429:
            raise NutritionError("Nutrition search limit reached. Try later or configure a USDA API key.") from None
        raise NutritionError("Nutrition search is unavailable. You can still add food manually.") from None
    except (TimeoutError, URLError, ValueError, KeyError, TypeError):
        raise NutritionError("Nutrition search is unavailable. You can still add food manually.") from None


def normalize_portions(food):
    """USDA household measures ("1 large (8\" to 8-7/8\" long)" = 136 g) for one food, smallest first.

    Only positive, finite gram weights are kept; duplicate labels keep the first. Labels are
    "<amount> <modifier>", e.g. "1 large (8\" to 8-7/8\" long)" or "1 cup, sliced".
    """
    portions, seen = [], set()
    for item in food.get("foodPortions") or []:
        grams, amount = item.get("gramWeight"), item.get("amount") or 1
        if type(grams) not in (int, float) or not math.isfinite(grams) or grams <= 0 or type(amount) not in (int, float) or amount <= 0:
            continue
        unit = (item.get("measureUnit") or {}).get("name")
        name = (item.get("modifier") or item.get("portionDescription") or (unit if unit and unit != "undetermined" else "") or "").strip()
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        amount_text = f"{amount:g}"
        # USDA gives the weight of `amount` units; store the weight of one so amounts scale simply.
        portions.append({"label": f"{amount_text} {name}"[:120], "grams": round(grams / amount, 2)})
    return sorted(portions, key=lambda portion: portion["grams"])[:20]


def food_portions(fdc_id):
    url = f"https://api.nal.usda.gov/fdc/v1/food/{int(fdc_id)}?" + urlencode({"api_key": os.getenv("USDA_API_KEY", "DEMO_KEY")})
    try:
        with urlopen(url, timeout=10) as response:
            return normalize_portions(json.load(response))
    except HTTPError as error:
        if error.code == 429:
            raise NutritionError("Nutrition search limit reached. Try later or configure a USDA API key.") from None
        if error.code == 404:
            return []
        raise NutritionError("Serving sizes are unavailable. You can still enter grams.") from None
    except (TimeoutError, URLError, ValueError, KeyError, TypeError):
        raise NutritionError("Serving sizes are unavailable. You can still enter grams.") from None
