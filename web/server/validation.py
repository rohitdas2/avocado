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
    return type(value) in (int, float) and math.isfinite(value) and minimum <= value <= maximum and (not integer or value == int(value))


def valid_id(value):
    return isinstance(value, str) and re.fullmatch(r"[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}", value) is not None


def valid_entry(body):
    return (isinstance(body, dict) and valid_name(body.get("name"), 120)
            and valid_number(body.get("calories"), 0, 100000, integer=True) and valid_date(body.get("date"))
            and all(body.get(key) is None or valid_number(body[key], 0, 100000) for key in ("protein", "carbs", "fat")))


def valid_lift(body):
    return (isinstance(body, dict) and valid_name(body.get("exercise"), 120)
            and valid_number(body.get("weight"), 0, 10000) and body.get("unit") in ("lb", "kg")
            and valid_number(body.get("sets"), 1, 100, integer=True)
            and valid_number(body.get("reps"), 1, 1000, integer=True) and valid_date(body.get("date")))
