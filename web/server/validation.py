from datetime import date
import math
import re


def valid_date(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return False
    try:
        return date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False


def valid_name(value, maximum=80):
    return isinstance(value, str) and 1 <= len(value.strip()) <= maximum


def valid_email(value):
    return isinstance(value, str) and len(value) <= 254 and re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value) is not None


def valid_password(value):
    return isinstance(value, str) and 12 <= len(value) <= 128


def valid_number(value, minimum, maximum, integer=False):
    return type(value) in (int, float) and minimum <= value <= maximum and math.isfinite(value) and (not integer or value == int(value))


def valid_id(value):
    return isinstance(value, str) and re.fullmatch(r"[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}", value) is not None


def valid_entry(body):
    return valid_custom_food(body) and valid_date(body.get("date"))


def valid_custom_food(body):
    """Custom food nutrition describes one serving; unknown macros stay null."""
    return (isinstance(body, dict) and valid_name(body.get("name"), 120)
            and valid_number(body.get("calories"), 0, 100000, integer=True)
            and all(body.get(key) is None or valid_number(body[key], 0, 100000) for key in ("protein", "carbs", "fat")))


def valid_weight(body):
    if not isinstance(body, dict) or body.get("unit") not in ("lb", "kg"):
        return False
    maximum = 1500 if body["unit"] == "kg" else 3307
    return (valid_date(body.get("date")) and valid_number(body.get("weight"), 0, maximum)
            and body["weight"] > 0)


def valid_lift(body):
    """Aggregate web-compatibility shape: one exercise name with sets × reps at one weight."""
    return (isinstance(body, dict) and valid_name(body.get("exercise"), 120)
            and valid_set({"reps": body.get("reps"), "weight": body.get("weight"), "unit": body.get("unit")})
            and valid_number(body.get("sets"), 1, 100, integer=True) and valid_date(body.get("date")))


def valid_set(item):
    return (isinstance(item, dict) and valid_number(item.get("reps"), 1, 1000, integer=True)
            and valid_number(item.get("weight"), 0, 10000) and item.get("unit") in ("lb", "kg"))


def valid_exercise(body):
    """A catalog exercise ID plus 1–100 individually recorded sets."""
    return (isinstance(body, dict) and valid_id(body.get("exerciseId"))
            and isinstance(body.get("sets"), list) and 1 <= len(body["sets"]) <= 100
            and all(valid_set(item) for item in body["sets"]))
