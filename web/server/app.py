import hashlib
import logging
import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv
from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

from .auth import (GUEST_COOKIE, SESSION_COOKIE, SESSION_SECONDS, account_response,
                   cookie_token, hash_password, new_token, public_account,
                   request_token, token_digest, verify_password)
from .db import PostgresStore, connect
from .nutrition import NutritionError, search_foods
from .progress import suggest_next, summarize_sets
from .validation import (valid_custom_food, valid_date, valid_email, valid_entry, valid_exercise, valid_set,
                         valid_id, valid_lift, valid_name, valid_password, valid_weight)


def create_app(store=None, nutrition_search=search_foods, config=None):
    """Create the WSGI app; injected stores/search functions are used by tests.

    Browsers use separate HttpOnly account/guest cookies. Mobile sends the same
    opaque session secret as a bearer token from secure storage. PostgreSQL is
    always the production repository; anonymous use still has private ownership.
    """
    web_directory = Path(__file__).resolve().parents[1]
    load_dotenv(web_directory / ".env")
    app = Flask(__name__, static_folder=str(web_directory / "dist"), static_url_path="")
    app.config.update(MAX_CONTENT_LENGTH=16 * 1024,
                      COOKIE_SECURE=os.getenv("AVOCADO_ENV", os.getenv("NODE_ENV")) == "production",
                      CREDENTIAL_LIMIT=20)
    # The website can be served from another origin (GitHub Pages) and call this API with bearer
    # tokens. Only these exact origins get CORS headers; credentials (cookies) are never allowed
    # cross-origin, so cookie sessions stay same-origin and keep their CSRF protection.
    app.config["ALLOWED_ORIGINS"] = {origin.strip().rstrip("/") for origin in os.getenv("ALLOWED_ORIGINS", "").split(",") if origin.strip()}
    if config:
        app.config.update(config)
    # Behind a hosting proxy, remote_addr is the proxy; trust exactly PROXY_HOPS forwarded hops so
    # the credential rate limit counts real clients instead of one shared proxy address.
    proxy_hops = int(os.getenv("PROXY_HOPS", "0"))
    if proxy_hops:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=proxy_hops, x_proto=proxy_hops, x_host=proxy_hops)

    def get_connection():
        if "database" not in g:
            g.database = connect()
        return g.database

    database = store if store is not None else PostgresStore(get_connection)
    app.extensions["avocado_store"] = database

    @app.teardown_appcontext
    def close_connection(_error):
        connection = g.pop("database", None)
        if connection is not None:
            connection.close()

    def body():
        value = request.get_json()
        return value if isinstance(value, dict) else {}

    def error(message, status):
        return jsonify(error=message), status

    def set_cookie(response, name, token):
        response.set_cookie(name, token, max_age=SESSION_SECONDS, httponly=True,
                            secure=app.config["COOKIE_SECURE"], samesite="Strict", path="/")

    def clear_cookie(response, name):
        response.delete_cookie(name, httponly=True, secure=app.config["COOKIE_SECURE"], samesite="Strict", path="/")

    def existing_guest():
        # Bearer clients and browsers identify the same isolated guest owner.
        token = request_token(request) if request.headers.get("Authorization") else cookie_token(request, GUEST_COOKIE)
        account = database.session_account(token_digest(token)) if token else None
        return (account, token) if account and account["is_guest"] else (None, None)

    def start_session(account, status=200, guest_id=None):
        # Absolute 30-day expiry is stored server-side and mirrored by Max-Age.
        token = new_token()
        database.create_session(token_digest(token), account["id"], datetime.now(timezone.utc) + timedelta(seconds=SESSION_SECONDS), guest_id=guest_id)
        response = jsonify(**account_response(account), token=token)
        response.status_code = status
        set_cookie(response, GUEST_COOKIE if account["is_guest"] else SESSION_COOKIE, token)
        return response

    @app.before_request
    def authorize():
        if not request.path.startswith("/api/"):
            return None
        if request.method == "OPTIONS":
            # CORS preflight carries no credentials; response_headers adds the allowlisted headers.
            return "", 204
        if request.method not in ("GET", "HEAD", "OPTIONS") and not request.headers.get("Authorization"):
            origin = request.headers.get("Origin")
            foreign_origin = False
            if origin:
                try:
                    parsed = urlsplit(origin)
                    foreign_origin = parsed.scheme not in ("http", "https") or parsed.netloc.lower() != request.host.lower()
                except ValueError:
                    foreign_origin = True
            # Allowlisted sites (GitHub Pages) start sessions here before they hold a token. SameSite=Strict
            # cookies never travel cross-site, so this cannot be used to write with a cookie session.
            allowlisted = bool(origin) and origin.rstrip("/") in app.config["ALLOWED_ORIGINS"]
            if not allowlisted and (foreign_origin or request.headers.get("Sec-Fetch-Site") == "cross-site"):
                return error("This request must come from Avocado.", 403)
        if request.endpoint not in ("health", "guest", "register", "login"):
            token = request_token(request)
            g.session_digest = token_digest(token) if token else None
            g.account = database.session_account(g.session_digest) if g.session_digest else None
            if not g.account:
                return error("Sign in to continue.", 401)
        if request.endpoint in ("guest", "register", "login", "change_password"):
            # PostgreSQL shares this limit across Gunicorn workers and restarts.
            window_start = int(time.time() // 900) * 900
            client_key = hashlib.sha256((request.remote_addr or "unknown").encode()).hexdigest()
            if not database.allow_credentials(client_key, window_start, app.config["CREDENTIAL_LIMIT"]):
                response = jsonify(error="Too many attempts. Try again later.")
                response.status_code = 429
                response.headers["Retry-After"] = str(max(1, window_start + 900 - int(time.time())))
                return response
        return None

    @app.after_request
    def response_headers(response):
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
            origin = (request.headers.get("Origin") or "").rstrip("/")
            response.headers.add("Vary", "Origin")
            if origin and origin in app.config["ALLOWED_ORIGINS"]:
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
                response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
                response.headers["Access-Control-Expose-Headers"] = "Retry-After"
                response.headers["Access-Control-Max-Age"] = "600"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.get("/api/health")
    def health():
        database.health()
        return jsonify(status="ok")

    @app.post("/api/auth/guest")
    def guest():
        account, token = existing_guest()
        if account:
            response = jsonify(**account_response(account), token=token)
        else:
            account = database.create_account({"id": str(uuid.uuid4()), "name": "Guest", "email": None, "password": None, "is_guest": True})
            response = start_session(account, 201)
        # Switching to a guest also clears an expired or previous account cookie.
        clear_cookie(response, SESSION_COOKIE)
        return response

    @app.post("/api/auth/register")
    def register():
        data = body()
        email = data.get("email", "")
        email = email.strip().lower() if isinstance(email, str) else ""
        if not valid_name(data.get("name")) or not valid_email(email) or not valid_password(data.get("password")):
            return error("Enter a name (1–80 characters), valid email, and password (12–128 characters).", 400)
        guest_account, _token = existing_guest()
        # Registration upgrades the current guest row, preserving its diary.
        details = {"name": data["name"].strip(), "email": email, "password": hash_password(data["password"])}
        account = database.upgrade_guest(guest_account["id"], details) if guest_account else database.create_account({"id": str(uuid.uuid4()), **details})
        if not account:
            return error("An account with that email already exists.", 409)
        response = start_session(account, 201)
        clear_cookie(response, GUEST_COOKIE)
        return response

    @app.post("/api/auth/login")
    def login():
        data = body()
        email = data.get("email", "")
        email = email.strip().lower() if isinstance(email, str) else ""
        if not valid_email(email) or not valid_password(data.get("password")):
            return error("Email or password is incorrect.", 401)
        account = database.account_by_email(email)
        if not verify_password(data["password"], account):
            return error("Email or password is incorrect.", 401)
        guest_account, _token = existing_guest()
        response = start_session(account, guest_id=guest_account["id"] if guest_account else None)
        clear_cookie(response, GUEST_COOKIE)
        return response

    @app.get("/api/account")
    def account():
        return jsonify(account_response(g.account))

    @app.patch("/api/account")
    def update_account():
        if g.account["is_guest"]:
            return error("Create an account to update your profile.", 403)
        data = body()
        if not valid_name(data.get("name")):
            return error("Enter a name using 1–80 characters.", 400)
        updated = database.update_account(g.account["id"], data["name"].strip())
        if not updated:
            return error("Sign in to continue.", 401)
        return jsonify(user=public_account(updated))

    @app.post("/api/account/password")
    def change_password():
        if g.account["is_guest"]:
            return error("Create an account to set a password.", 403)
        data = body()
        if not valid_password(data.get("currentPassword")) or not valid_password(data.get("newPassword")):
            return error("Passwords must use 12–128 characters.", 400)
        current = database.account_by_id(g.account["id"])
        if not verify_password(data["currentPassword"], current):
            return error("Current password is incorrect.", 401)
        if not database.change_password(current["id"], current["password"], hash_password(data["newPassword"]), g.session_digest):
            return error("Your password changed elsewhere. Sign in and try again.", 409)
        return "", 204

    @app.post("/api/auth/logout")
    def logout():
        database.remove_session(g.session_digest)
        response = app.response_class(status=204)
        clear_cookie(response, GUEST_COOKIE if g.account["is_guest"] else SESSION_COOKIE)
        return response

    @app.get("/api/entries")
    def list_entries():
        date = request.args.get("date")
        if not valid_date(date):
            return error("Choose a valid date (YYYY-MM-DD).", 400)
        entries = database.list(date, g.account["id"])
        return jsonify(entries=entries, total=sum(entry["calories"] for entry in entries))

    @app.post("/api/entries")
    def add_entry():
        data = body()
        if not valid_entry(data):
            return error("Enter a food name (1–120 characters), whole-number calories (0–100,000), and a valid date.", 400)
        entry = {key: data.get(key) for key in ("name", "calories", "date", "protein", "carbs", "fat")}
        entry.update(id=str(uuid.uuid4()), name=data["name"].strip())
        return jsonify(database.add(entry, g.account["id"])), 201

    @app.delete("/api/entries/<entry_id>")
    def remove_entry(entry_id):
        if not valid_id(entry_id):
            return error("Invalid entry ID.", 400)
        if not database.remove(entry_id, g.account["id"]):
            return error("Entry not found.", 404)
        return "", 204

    @app.get("/api/custom-foods")
    def list_custom_foods():
        return jsonify(foods=database.list_custom_foods(g.account["id"]))

    @app.post("/api/custom-foods")
    def add_custom_food():
        data = body()
        if not valid_custom_food(data):
            return error("Enter a food name (1–120 characters), whole-number calories (0–100,000), and optional macros (0–100,000 g) per serving.", 400)
        food = {key: data.get(key) for key in ("name", "calories", "protein", "carbs", "fat")}
        food.update(id=str(uuid.uuid4()), name=data["name"].strip())
        return jsonify(database.add_custom_food(food, g.account["id"])), 201

    @app.delete("/api/custom-foods/<food_id>")
    def remove_custom_food(food_id):
        if not valid_id(food_id):
            return error("Invalid custom food ID.", 400)
        if not database.remove_custom_food(food_id, g.account["id"]):
            return error("Custom food not found.", 404)
        return "", 204

    @app.get("/api/weights")
    def list_weights():
        if g.account["is_guest"]:
            return error("Sign in to track your weight.", 403)
        return jsonify(entries=database.list_weights(g.account["id"]))

    @app.post("/api/weights")
    def save_weight():
        if g.account["is_guest"]:
            return error("Sign in to track your weight.", 403)
        data = body()
        if not valid_weight(data):
            return error("Enter a valid date and a weight greater than zero, up to 1,500 kg or 3,307 lb.", 400)
        return jsonify(database.save_weight({key: data[key] for key in ("date", "weight", "unit")}, g.account["id"]))

    @app.delete("/api/weights/<date>")
    def remove_weight(date):
        if g.account["is_guest"]:
            return error("Sign in to track your weight.", 403)
        if not valid_date(date):
            return error("Choose a valid date (YYYY-MM-DD).", 400)
        if not database.remove_weight(date, g.account["id"]):
            return error("Weight entry not found.", 404)
        return "", 204

    @app.get("/api/workouts")
    def list_workouts():
        date = request.args.get("date")
        if not valid_date(date):
            return error("Choose a valid date.", 400)
        # `current` is reported separately because it may belong to a different date than `date`.
        return jsonify(workouts=database.list_workouts(date, g.account["id"]), current=database.current_workout(g.account["id"]))

    @app.post("/api/workouts")
    def add_workout():
        data = body()
        if not valid_name(data.get("name"), 120) or not valid_date(data.get("date")):
            return error("Enter a workout name (1–120 characters) and a valid date.", 400)
        entry = {"id": str(uuid.uuid4()), "name": data["name"].strip(), "date": data["date"]}
        saved = database.add_workout(entry, g.account["id"])
        if saved is None:
            return error("End your current workout before starting a new one.", 409)
        return jsonify(saved), 201

    @app.post("/api/workouts/<workout_id>/end")
    def end_workout(workout_id):
        # Ending is the only way out of a workout; afterwards it is read-only history.
        if not valid_id(workout_id):
            return error("Invalid workout ID.", 400)
        ended = database.end_workout(workout_id, g.account["id"])
        if not ended:
            return error("Current workout not found. Refresh your workouts and try again.", 404)
        return jsonify(ended)

    @app.get("/api/exercises")
    def list_exercises():
        # App-owned catalog: read-only for every client; definitions change only in schema.sql.
        return jsonify(exercises=database.list_exercises())

    @app.get("/api/exercises/<exercise_id>/progress")
    def exercise_progress(exercise_id):
        # One shared read for the Lifts logging form and the Profile progress view.
        if not valid_id(exercise_id):
            return error("Invalid exercise ID.", 400)
        sessions = [{**session, **summarize_sets(session["sets"])} for session in database.exercise_history(g.account["id"], exercise_id) if session["sets"]]
        # Suggest from the latest finished session so sets added today don't move today's target.
        base = next((item for item in reversed(sessions) if not item["isCurrent"]), sessions[-1] if sessions else None)
        return jsonify(sessions=sessions, lastSession=base, suggestion=suggest_next(base["sets"]) if base else None,
                       bestE1rmKg=max((item["e1rmKg"] for item in sessions), default=None))

    @app.get("/api/progress")
    def progress():
        return jsonify(exercises=database.progress_summary(g.account["id"]))

    @app.post("/api/workouts/<workout_id>/exercises")
    def add_exercise(workout_id):
        data = body()
        if not valid_id(workout_id) or not valid_exercise(data):
            return error("Choose an exercise and enter 1–100 sets, each with reps (1–1,000), weight (0–10,000), and unit.", 400)
        # Optional supersetWith: an exercise already in this workout to alternate sets with.
        if data.get("supersetWith") is not None and not valid_id(data["supersetWith"]):
            return error("Invalid superset exercise.", 400)
        entry = {"id": str(uuid.uuid4()), "exerciseId": data["exerciseId"].lower(), "supersetWith": data.get("supersetWith"),
                 "sets": [{key: item[key] for key in ("reps", "weight", "unit")} for item in data["sets"]]}
        saved = database.add_exercise(workout_id, entry, g.account["id"])
        if saved is None:
            return error("Current workout not found. Refresh your workouts and try again.", 404)
        if saved is False:
            return error("Choose an exercise from the list.", 400)
        if saved == "partner":
            return error("The superset exercise isn't in this workout.", 400)
        return jsonify(saved), 201

    # Sets are logged one at a time as they are done; each belongs to one exercise in the workout.
    @app.post("/api/workouts/<workout_id>/exercises/<entry_id>/sets")
    def add_set(workout_id, entry_id):
        data = body()
        if not valid_id(workout_id) or not valid_id(entry_id) or not valid_set(data):
            return error("Enter reps (1–1,000), weight (0–10,000), and unit.", 400)
        saved = database.add_set(workout_id, entry_id, {key: data[key] for key in ("reps", "weight", "unit")}, g.account["id"])
        if saved is None:
            return error("Current workout exercise not found. Refresh your workouts and try again.", 404)
        if saved is False:
            return error("An exercise can have at most 100 sets.", 400)
        return jsonify(saved), 201

    @app.delete("/api/workouts/<workout_id>/exercises/<entry_id>/sets/<set_id>")
    def remove_set(workout_id, entry_id, set_id):
        if not (valid_id(workout_id) and valid_id(entry_id) and valid_id(set_id)):
            return error("Invalid workout, exercise, or set ID.", 400)
        result = database.remove_set(workout_id, entry_id, set_id, g.account["id"])
        if result is None:
            return error("Set not found in the current workout.", 404)
        return jsonify(result)

    # Link an exercise into a superset with another one in the same workout ({"with": id}),
    # or leave its superset ({"with": null}).
    @app.put("/api/workouts/<workout_id>/exercises/<entry_id>/superset")
    def set_superset(workout_id, entry_id):
        data = body()
        partner = data.get("with")
        if not valid_id(workout_id) or not valid_id(entry_id) or (partner is not None and not valid_id(partner)):
            return error("Invalid workout or exercise ID.", 400)
        result = database.set_superset(workout_id, entry_id, partner, g.account["id"])
        if result is None:
            return error("Both exercises must be in the current workout.", 404)
        return jsonify(supersets=result)

    @app.delete("/api/workouts/<workout_id>/exercises/<entry_id>")
    def remove_exercise(workout_id, entry_id):
        if not valid_id(workout_id) or not valid_id(entry_id):
            return error("Invalid workout or exercise ID.", 400)
        if not database.remove_exercise(workout_id, entry_id, g.account["id"]):
            return error("Current workout exercise not found. Refresh your workouts and try again.", 404)
        return "", 204

    @app.get("/api/lifts")
    def list_lifts():
        date = request.args.get("date")
        if not valid_date(date):
            return error("Choose a valid date.", 400)
        return jsonify(entries=database.list_lifts(date, g.account["id"]))

    @app.post("/api/lifts")
    def add_lift():
        data = body()
        if not valid_lift(data):
            return error("Enter an exercise, weight (0–10,000), unit, sets (1–100), reps (1–1,000), and a valid date.", 400)
        entry = {key: data[key] for key in ("exercise", "weight", "unit", "sets", "reps", "date")}
        entry.update(id=str(uuid.uuid4()), exercise=data["exercise"].strip())
        saved = database.add_lift(entry, g.account["id"])
        if saved is None:
            return error("Choose an exercise from the Avocado exercise list.", 400)
        return jsonify(saved), 201

    @app.delete("/api/lifts/<entry_id>")
    def remove_lift(entry_id):
        if not valid_id(entry_id):
            return error("Invalid lift ID.", 400)
        if not database.remove_lift(entry_id, g.account["id"]):
            return error("Lift not found.", 404)
        return "", 204

    @app.get("/api/foods/search")
    def food_search():
        query = request.args.get("q", "")
        if not 2 <= len(query.strip()) or len(query) > 100:
            return error("Search for an ingredient using 2–100 characters.", 400)
        try:
            return jsonify(foods=nutrition_search(query.strip()), source="USDA FoodData Central", basis="per 100 g")
        except NutritionError as failure:
            return error(str(failure), 502)

    @app.get("/")
    def index():
        return send_from_directory(app.static_folder, "index.html")

    @app.errorhandler(HTTPException)
    def http_error(failure):
        messages = {400: "Invalid JSON.", 404: "API route not found.", 405: "Method not allowed.", 413: "Request is too large.", 415: "Send JSON using Content-Type: application/json."}
        return error(messages.get(failure.code, failure.description), failure.code)

    @app.errorhandler(Exception)
    def database_error(failure):
        logging.getLogger(__name__).error("Request failed: %s", type(failure).__name__)
        return error("Unable to reach the database. Please try again.", 503)

    return app
