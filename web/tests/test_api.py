from datetime import datetime, timedelta, timezone
import hashlib
import unittest
import uuid

from helpers import MemoryStore
from server.app import create_app
from server.auth import hash_password, token_digest, verify_password
from server.nutrition import NutritionError, normalize_food, normalize_portions
from server.validation import valid_date, valid_entry, valid_lift

PASSWORD = "Correct horse 123"
FOOD = {"name": "Toast", "calories": 320, "date": "2026-10-16"}
LIFT = {"exercise": "Squat", "weight": 135, "unit": "lb", "sets": 3, "reps": 8, "date": "2026-10-16"}


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.store = MemoryStore()
        self.app = create_app(self.store, config={"TESTING": True})
        self.api = self.app.test_client()

    def register(self, client=None, email="rohit@example.com", name="Rohit", password=PASSWORD):
        response = (client or self.api).post("/api/auth/register", json={"name": name, "email": email, "password": password})
        self.assertEqual(response.status_code, 201, response.json)
        return response

    def bearer(self, token):
        return {"Authorization": f"Bearer {token}"}

    def test_password_reference_format_and_unique_salts(self):
        encoded = hash_password("A unicode password 🥑")
        algorithm, salt, digest = encoded.split("$")
        self.assertEqual(algorithm, "sha512")
        self.assertEqual(uuid.UUID(hex=salt).version, 4)
        self.assertEqual(len(salt), 32)
        self.assertEqual(len(digest), 128)
        self.assertEqual(digest, hashlib.sha512((salt + "A unicode password 🥑").encode("utf-8")).hexdigest())
        self.assertTrue(verify_password("A unicode password 🥑", {"password": encoded}))
        self.assertFalse(verify_password("A different password", {"password": encoded}))
        self.assertFalse(verify_password(PASSWORD, None))
        self.assertFalse(verify_password(PASSWORD, {"password": "sha256$bad$bad"}))
        self.assertNotEqual(encoded, hash_password("A unicode password 🥑"))

    def test_account_cookie_persists_and_no_secret_fields_are_exposed(self):
        response = self.register(email="  ROHIT@EXAMPLE.COM  ", name=" Rohit ")
        self.assertEqual(response.json["user"]["email"], "rohit@example.com")
        self.assertEqual(response.json["user"]["name"], "Rohit")
        self.assertEqual(set(response.json["user"]), {"id", "name", "email"})
        cookies = " ".join(response.headers.getlist("Set-Cookie"))
        for setting in ("HttpOnly", "SameSite=Strict", "Max-Age=2592000"):
            self.assertIn(setting, cookies)
        token = response.json["token"]
        self.assertEqual(len(token), 64)
        self.assertNotIn(token, self.store.sessions)
        self.assertIn(token_digest(token), self.store.sessions)
        self.assertEqual(self.api.get("/api/account").json, {"user": response.json["user"]})
        stored = self.store.accounts[response.json["user"]["id"]]
        self.assertNotIn(PASSWORD, stored["password"])

    def test_secure_cookie_in_production(self):
        client = create_app(MemoryStore(), config={"COOKIE_SECURE": True}).test_client()
        response = self.register(client)
        self.assertIn("Secure", " ".join(response.headers.getlist("Set-Cookie")))

    def test_invalid_registration_and_duplicate_email(self):
        for changes in ({"name": " "}, {"name": "x" * 81}, {"email": "bad"}, {"email": "a" * 255 + "@x.com"}, {"password": "short"}, {"password": "x" * 129}, {"name": None}):
            data = {"name": "Rohit", "email": "rohit@example.com", "password": PASSWORD, **changes}
            self.assertEqual(self.api.post("/api/auth/register", json=data).status_code, 400)
        self.assertEqual(len(self.store.accounts), 0)
        self.register()
        self.assertEqual(self.api.post("/api/auth/register", json={"name": "Another", "email": " ROHIT@example.com ", "password": PASSWORD}).status_code, 409)
        self.assertEqual(len(self.store.accounts), 1)

    def test_login_has_generic_failure_and_cookie_authentication(self):
        self.register()
        client = self.app.test_client()
        first = client.post("/api/auth/login", json={"email": "rohit@example.com", "password": "Wrong password 123"})
        second = client.post("/api/auth/login", json={"email": "missing@example.com", "password": "Wrong password 123"})
        self.assertEqual(first.status_code, 401)
        self.assertEqual(second.status_code, 401)
        self.assertEqual(first.json, second.json)
        signed_in = client.post("/api/auth/login", json={"email": " ROHIT@example.com ", "password": PASSWORD})
        self.assertEqual(signed_in.status_code, 200)
        self.assertEqual(client.get("/api/account").json["user"]["email"], "rohit@example.com")

    def test_sessions_expire_and_logout_revokes_bearer_and_cookie(self):
        token = self.register().json["token"]
        self.assertEqual(self.api.post("/api/auth/logout").status_code, 204)
        self.assertEqual(self.api.get("/api/account").status_code, 401)
        self.assertEqual(self.api.get("/api/account", headers=self.bearer(token)).status_code, 401)
        response = self.api.post("/api/auth/login", json={"email": "rohit@example.com", "password": PASSWORD})
        self.store.sessions[token_digest(response.json["token"])]["expires_at"] = datetime.now(timezone.utc) - timedelta(seconds=1)
        self.assertEqual(self.api.get("/api/account").status_code, 401)

    def test_profile_and_password_changes_revoke_other_sessions(self):
        first = self.register().json["token"]
        second = self.app.test_client().post("/api/auth/login", json={"email": "rohit@example.com", "password": PASSWORD}).json["token"]
        self.assertEqual(self.api.patch("/api/account", json={"name": "  New name  "}).json["user"]["name"], "New name")
        self.assertEqual(self.api.patch("/api/account", json={"name": " "}).status_code, 400)
        self.assertEqual(self.api.post("/api/account/password", json={"currentPassword": "A wrong password", "newPassword": "New secure password"}).status_code, 401)
        before = next(iter(self.store.accounts.values()))["password"]
        self.assertEqual(self.api.post("/api/account/password", json={"currentPassword": PASSWORD, "newPassword": "New secure password"}).status_code, 204)
        after = next(iter(self.store.accounts.values()))["password"]
        self.assertNotEqual(before, after)
        self.assertEqual(self.api.get("/api/account", headers=self.bearer(first)).status_code, 200)
        self.assertEqual(self.api.get("/api/account", headers=self.bearer(second)).status_code, 401)
        self.assertEqual(self.api.post("/api/auth/login", json={"email": "rohit@example.com", "password": PASSWORD}).status_code, 401)
        self.assertEqual(self.api.post("/api/auth/login", json={"email": "rohit@example.com", "password": "New secure password"}).status_code, 200)

    def test_diary_requires_a_private_account_or_guest_session(self):
        for method, path, data in (("get", "/api/account", None), ("get", "/api/entries?date=2026-10-16", None), ("post", "/api/entries", FOOD), ("delete", f"/api/entries/{uuid.uuid4()}", None), ("get", "/api/lifts?date=2026-10-16", None), ("post", "/api/lifts", LIFT), ("delete", f"/api/lifts/{uuid.uuid4()}", None), ("get", "/api/foods/search?q=oats", None)):
            self.assertEqual(getattr(self.api, method)(path, json=data).status_code, 401, path)
        self.assertEqual(self.api.get("/api/health").status_code, 200)

    def test_rate_limit_is_enforced_with_retry_after(self):
        self.app.config["CREDENTIAL_LIMIT"] = 2
        for _ in range(2):
            self.assertEqual(self.api.post("/api/auth/login", json={}).status_code, 401)
        response = self.api.post("/api/auth/login", json={})
        self.assertEqual(response.status_code, 429)
        self.assertGreater(int(response.headers["Retry-After"]), 0)

    def test_allowlisted_site_uses_bearer_tokens_cross_origin(self):
        pages = "https://rohitdas2.github.io"
        app = create_app(MemoryStore(), config={"TESTING": True, "ALLOWED_ORIGINS": {pages}})
        client = app.test_client(use_cookies=False)
        # Preflight needs no session and returns the allowlisted CORS headers, never credentials.
        preflight = client.options("/api/entries", headers={"Origin": pages, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization, content-type"})
        self.assertEqual(preflight.status_code, 204)
        self.assertEqual(preflight.headers["Access-Control-Allow-Origin"], pages)
        self.assertIn("Authorization", preflight.headers["Access-Control-Allow-Headers"])
        self.assertNotIn("Access-Control-Allow-Credentials", preflight.headers)
        guest = client.post("/api/auth/guest", headers={"Origin": pages})
        self.assertEqual(guest.status_code, 201, guest.json)
        self.assertEqual(guest.headers["Access-Control-Allow-Origin"], pages)
        headers = {"Origin": pages, **self.bearer(guest.json["token"])}
        self.assertEqual(client.post("/api/entries", json=FOOD, headers=headers).status_code, 201)
        listed = client.get(f"/api/entries?date={FOOD['date']}", headers=headers)
        self.assertEqual((listed.status_code, listed.json["total"]), (200, 320))
        # A cross-site request carries no session cookie, so without a token it is unauthenticated.
        self.assertEqual(client.post("/api/entries", json=FOOD, headers={"Origin": pages, "Sec-Fetch-Site": "cross-site"}).status_code, 401)
        # Other origins get no CORS headers, and their non-bearer writes stay refused.
        other = client.get("/api/entries?date=2026-10-16", headers={"Origin": "https://foreign.example", **self.bearer(guest.json["token"])})
        self.assertNotIn("Access-Control-Allow-Origin", other.headers)
        self.assertEqual(app.test_client().post("/api/auth/guest", headers={"Origin": "https://foreign.example"}).status_code, 403)

    def test_browser_writes_reject_foreign_origins(self):
        self.register()
        self.assertEqual(self.api.post("/api/entries", json=FOOD, headers={"Origin": "https://foreign.example"}).status_code, 403)
        self.assertEqual(self.api.post("/api/entries", json=FOOD, headers={"Sec-Fetch-Site": "cross-site"}).status_code, 403)
        self.assertEqual(self.api.post("/api/entries", json=FOOD, headers={"Origin": "http://localhost"}).status_code, 201)
        self.assertEqual(self.api.get("/api/account", headers={"Authorization": "Bearer invalid"}).status_code, 401)

    def test_guest_diary_persists_and_registration_upgrades_it(self):
        response = self.api.post("/api/auth/guest")
        self.assertEqual(response.status_code, 201)
        guest_token = response.json["token"]
        self.assertTrue(response.json["guest"])
        self.assertIsNone(response.json["user"])
        self.assertIn("Max-Age=2592000", " ".join(response.headers.getlist("Set-Cookie")))
        self.assertEqual(self.api.get("/api/account").json, {"user": None, "guest": True})
        self.assertEqual(self.api.post("/api/auth/guest").json["token"], guest_token)
        self.assertEqual(self.api.patch("/api/account", json={"name": "New"}).status_code, 403)
        self.assertEqual(self.api.post("/api/account/password", json={}).status_code, 403)
        self.api.post("/api/entries", json=FOOD)
        other = self.app.test_client()
        other.post("/api/auth/guest")
        self.assertEqual(other.get("/api/entries?date=2026-10-16").json["total"], 0)
        created = self.register()
        self.assertEqual(len(self.store.accounts), 2)
        self.assertEqual(self.api.get("/api/entries?date=2026-10-16").json["total"], 320)
        self.assertEqual(self.api.get("/api/account", headers=self.bearer(guest_token)).status_code, 401)
        self.assertEqual(self.api.get("/api/account").json["user"], created.json["user"])

    def test_login_consumes_guest_diary_and_rotates_session(self):
        registered = self.app.test_client()
        self.register(registered)
        guest = self.api.post("/api/auth/guest").json
        self.api.post("/api/entries", json=FOOD)
        login = self.api.post("/api/auth/login", json={"email": "rohit@example.com", "password": PASSWORD})
        self.assertEqual(login.status_code, 200)
        self.assertNotEqual(login.json["token"], guest["token"])
        self.assertEqual(self.api.get("/api/entries?date=2026-10-16").json["total"], 320)
        self.assertEqual(self.api.get("/api/account", headers=self.bearer(guest["token"])).status_code, 401)
        self.api.post("/api/auth/logout")
        restored = self.api.post("/api/auth/guest")
        self.assertEqual(restored.status_code, 201)
        self.assertNotEqual(restored.json["token"], guest["token"])
        self.assertEqual(self.api.get("/api/entries?date=2026-10-16").json["total"], 0)
        self.assertEqual(registered.get("/api/entries?date=2026-10-16").json["total"], 320)

    def test_mobile_guest_bearer_upgrade_retains_diary(self):
        client = self.app.test_client(use_cookies=False)
        token = client.post("/api/auth/guest").json["token"]
        client.post("/api/entries", json=FOOD, headers=self.bearer(token))
        response = client.post("/api/auth/register", json={"name": "Mobile", "email": "mobile@example.com", "password": PASSWORD}, headers=self.bearer(token))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(client.get("/api/entries?date=2026-10-16", headers=self.bearer(response.json["token"])).json["total"], 320)
        self.assertEqual(client.get("/api/account", headers=self.bearer(token)).status_code, 401)

    def test_food_lift_crud_and_account_isolation(self):
        self.register()
        other = self.app.test_client()
        self.register(other, "sam@example.com", "Sam")
        self.store.foods.append({"id": "legacy", "name": "Legacy", "date": FOOD["date"], "calories": 900})
        self.store.lifts.append({"id": "legacy", **LIFT})
        food = self.api.post("/api/entries", json={**FOOD, "name": " Toast ", "protein": 12}).json
        lift = self.api.post("/api/lifts", json=LIFT).json
        self.assertEqual(food["name"], "Toast")
        self.assertEqual(other.get("/api/entries?date=2026-10-16").json, {"entries": [], "total": 0})
        self.assertEqual(other.get("/api/lifts?date=2026-10-16").json, {"entries": []})
        self.assertEqual(other.delete(f"/api/entries/{food['id']}").status_code, 404)
        self.assertEqual(other.delete(f"/api/lifts/{lift['id']}").status_code, 404)
        self.assertEqual(self.api.get("/api/entries?date=2026-10-16").json["total"], 320)
        self.assertEqual(self.api.get("/api/entries?date=2026-10-17").json["total"], 0)
        self.assertEqual(self.api.get("/api/lifts?date=2026-10-16").json["entries"][0]["weight"], 135)
        self.assertEqual(self.api.delete(f"/api/entries/{food['id']}").status_code, 204)
        self.assertEqual(self.api.delete(f"/api/lifts/{lift['id']}").status_code, 204)
        self.assertEqual(self.api.delete(f"/api/entries/{food['id']}").status_code, 404)
        self.assertEqual(len(self.store.foods), 1)

    def test_invalid_diary_payloads_and_json(self):
        self.register()
        for change in ({"name": " "}, {"name": "x" * 121}, {"calories": -1}, {"calories": 1.5}, {"calories": "20"}, {"calories": True}, {"calories": None}, {"calories": 100001}, {"date": "2026-02-30"}, {"protein": -1}):
            self.assertEqual(self.api.post("/api/entries", json={**FOOD, **change}).status_code, 400)
        for change in ({"weight": -1}, {"unit": "oz"}, {"sets": 0}, {"reps": 1001}, {"sets": True}, {"exercise": " "}):
            self.assertEqual(self.api.post("/api/lifts", json={**LIFT, **change}).status_code, 400)
        self.assertEqual(self.api.get("/api/entries").status_code, 400)
        self.assertEqual(self.api.get("/api/lifts?date=bad").status_code, 400)
        self.assertEqual(self.api.delete("/api/entries/not-a-uuid").status_code, 400)
        self.assertEqual(self.api.post("/api/entries", data="{", content_type="application/json").status_code, 400)
        self.assertEqual(self.api.post("/api/entries", data="x" * 17000, content_type="application/json").status_code, 413)
        self.assertEqual(self.api.get("/api/unknown").status_code, 404)

    def test_database_errors_do_not_expose_private_details(self):
        self.register()
        def fail(*_args):
            raise RuntimeError("private connection details")
        self.store.list = fail
        response = self.api.get("/api/entries?date=2026-10-16")
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private connection details", response.text)
        self.assertIn("database", response.json["error"])

    def test_nutrition_search_validation_normalization_and_failure(self):
        self.register()
        self.assertEqual(self.api.get("/api/foods/search?q=x").status_code, 400)
        search = create_app(self.store, lambda query: [{"id": 1, "name": query, "calories": 100}]).test_client()
        token = self.api.post("/api/auth/login", json={"email": "rohit@example.com", "password": PASSWORD}).json["token"]
        response = search.get("/api/foods/search?q=oats", headers=self.bearer(token))
        self.assertEqual(response.json["foods"][0]["name"], "oats")
        def unavailable(_query):
            raise NutritionError("Nutrition search is unavailable.")
        broken = create_app(self.store, unavailable).test_client()
        self.assertEqual(broken.get("/api/foods/search?q=oats", headers=self.bearer(token)).status_code, 502)
        self.assertEqual(normalize_food({"fdcId": 1, "description": "Avocado", "foodNutrients": [{"nutrientId": 1003, "value": 0}, {"nutrientId": 1004, "value": 15.4}, {"nutrientId": 1062, "value": 700}, {"nutrientId": 2048, "value": 167}]}),
                         {"id": 1, "name": "Avocado", "protein": 0, "carbs": None, "fat": 15.4, "calories": 167})

    def test_food_portions_route_and_normalization(self):
        self.register()
        token = self.api.post("/api/auth/login", json={"email": "rohit@example.com", "password": PASSWORD}).json["token"]
        app = create_app(self.store, config={"TESTING": True}, nutrition_portions=lambda fdc_id: [{"label": "1 large", "grams": 136.0}] if fdc_id == 173944 else [])
        client = app.test_client(use_cookies=False)
        response = client.get("/api/foods/173944/portions", headers=self.bearer(token))
        self.assertEqual((response.status_code, response.json["portions"]), (200, [{"label": "1 large", "grams": 136.0}]))
        self.assertEqual(client.get("/api/foods/173944/portions").status_code, 401)
        self.assertEqual(client.get("/api/foods/abc/portions", headers=self.bearer(token)).status_code, 404)
        def unavailable(_fdc_id):
            raise NutritionError("Serving sizes are unavailable.")
        broken = create_app(self.store, config={"TESTING": True}, nutrition_portions=unavailable).test_client(use_cookies=False)
        self.assertEqual(broken.get("/api/foods/1/portions", headers=self.bearer(token)).status_code, 502)
        # USDA detail data (abridged from "Bananas, raw"): per-unit grams, smallest first, bad rows dropped.
        portions = normalize_portions({"foodPortions": [
            {"amount": 1.0, "modifier": "large (8\" to 8-7/8\" long)", "gramWeight": 136.0},
            {"amount": 1.0, "modifier": "cup, sliced", "gramWeight": 150.0},
            {"amount": 1.0, "modifier": "small (6\" to 6-7/8\" long)", "gramWeight": 101.0},
            {"amount": 2.0, "modifier": "tbsp", "gramWeight": 12.4},
            {"amount": 1.0, "modifier": "Large (8\" to 8-7/8\" long)", "gramWeight": 140.0},
            {"amount": 1.0, "modifier": "broken", "gramWeight": 0},
            {"amount": 1.0, "modifier": "", "measureUnit": {"name": "undetermined"}, "gramWeight": 5},
        ]})
        self.assertEqual(portions, [{"label": "2 tbsp", "grams": 6.2}, {"label": "1 small (6\" to 6-7/8\" long)", "grams": 101.0},
                                    {"label": "1 large (8\" to 8-7/8\" long)", "grams": 136.0}, {"label": "1 cup, sliced", "grams": 150.0}])
        self.assertEqual(normalize_portions({}), [])

    def test_calendar_and_numeric_validation(self):
        for date in ("2026-02-29", "2026-04-31", "bad", "0000-01-01", "2026-1-01", None):
            self.assertFalse(valid_date(date))
        for date in ("2024-02-29", "2026-10-16", "0001-01-01"):
            self.assertTrue(valid_date(date))
        self.assertTrue(valid_entry({**FOOD, "protein": None}))
        self.assertFalse(valid_entry({**FOOD, "protein": float("nan")}))
        self.assertFalse(valid_entry({**FOOD, "calories": 10 ** 1000}))
        self.assertFalse(valid_lift({**LIFT, "weight": float("inf")}))

    def test_guest_custom_food_catalog_is_private_and_survives_registration(self):
        self.api.post("/api/auth/guest")
        response = self.api.post("/api/custom-foods", json={"name": "  Homemade oats  ", "calories": 180, "protein": 0, "carbs": 25.5})
        self.assertEqual(response.status_code, 201, response.json)
        food = response.json
        self.assertEqual(food["name"], "Homemade oats")
        self.assertEqual(food["protein"], 0)
        self.assertEqual(food["carbs"], 25.5)
        self.assertIsNone(food["fat"])
        self.assertEqual(set(food), {"id", "name", "calories", "protein", "carbs", "fat"})
        self.assertEqual(self.api.get("/api/custom-foods").json, {"foods": [food]})
        other = self.app.test_client()
        other.post("/api/auth/guest")
        self.assertEqual(other.get("/api/custom-foods").json, {"foods": []})
        self.assertEqual(other.delete(f"/api/custom-foods/{food['id']}").status_code, 404)
        self.register()
        self.assertEqual(self.api.get("/api/custom-foods").json["foods"], [food])
        logged = self.api.post("/api/entries", json={**food, "date": "2026-10-16"})
        self.assertEqual(logged.status_code, 201)
        self.assertEqual(self.api.delete(f"/api/custom-foods/{food['id']}").status_code, 204)
        self.assertEqual(self.api.get("/api/custom-foods").json["foods"], [])
        # Saved-food deletion leaves the earlier diary nutrition snapshot intact.
        entries = self.api.get("/api/entries?date=2026-10-16").json["entries"]
        self.assertEqual(entries[0]["calories"], 180)
        self.assertEqual(entries[0]["carbs"], 25.5)
        self.assertEqual(self.api.delete(f"/api/custom-foods/{food['id']}").status_code, 404)

    def test_custom_food_validation_and_session_requirement(self):
        for method, path in (("get", "/api/custom-foods"), ("post", "/api/custom-foods"), ("delete", f"/api/custom-foods/{uuid.uuid4()}")):
            self.assertEqual(getattr(self.api, method)(path, json={}).status_code, 401)
        self.register()
        base = {"name": "Oats", "calories": 180}
        for invalid in ({"name": " "}, {"name": "x" * 121}, {"calories": -1}, {"calories": 10.5}, {"calories": True}, {"protein": "5"}, {"carbs": -1}, {"fat": float("inf")}, {"protein": 100001}):
            self.assertEqual(self.api.post("/api/custom-foods", json={**base, **invalid}).status_code, 400)
        self.assertEqual(self.api.get("/api/custom-foods").json["foods"], [])
        self.assertEqual(self.api.delete("/api/custom-foods/bad-id").status_code, 400)

    def test_weight_tracking_requires_registered_account(self):
        for method, path in (("get", "/api/weights"), ("post", "/api/weights"), ("delete", "/api/weights/2026-10-16")):
            self.assertEqual(getattr(self.api, method)(path, json={}).status_code, 401)
        self.api.post("/api/auth/guest")
        for method, path in (("get", "/api/weights"), ("post", "/api/weights"), ("delete", "/api/weights/2026-10-16")):
            self.assertEqual(getattr(self.api, method)(path, json={"date": "2026-10-16", "weight": 70, "unit": "kg"}).status_code, 403)
        self.assertEqual(len(self.store.weights), 0)

    def test_weight_upserts_units_and_owner_isolation(self):
        self.register()
        first = self.api.post("/api/weights", json={"date": "2026-10-16", "weight": 75.5, "unit": "kg"})
        self.assertEqual(first.status_code, 200, first.json)
        self.assertEqual(first.json, {"date": "2026-10-16", "weight": 75.5, "unit": "kg", "weightKg": 75.5})
        updated = self.api.post("/api/weights", json={"date": "2026-10-16", "weight": 165.25, "unit": "lb"})
        self.assertAlmostEqual(updated.json["weightKg"], 165.25 * 0.45359237)
        self.assertEqual(updated.json["weight"], 165.25)
        self.assertEqual(updated.json["unit"], "lb")
        self.assertEqual(len(self.api.get("/api/weights").json["entries"]), 1)
        other = self.app.test_client()
        self.register(other, "other@example.com", "Other")
        self.assertEqual(other.get("/api/weights").json, {"entries": []})
        self.assertEqual(other.delete("/api/weights/2026-10-16").status_code, 404)
        self.assertEqual(self.api.delete("/api/weights/2026-10-16").status_code, 204)
        self.assertEqual(self.api.get("/api/weights").json["entries"], [])
        self.assertEqual(self.api.delete("/api/weights/2026-10-16").status_code, 404)

    def test_weight_history_latest_30_logged_dates_and_validation(self):
        self.register()
        base = {"date": "2026-10-16", "weight": 75, "unit": "kg"}
        for invalid in ({"weight": 0}, {"weight": -1}, {"weight": True}, {"weight": "70"}, {"weight": float("nan")}, {"weight": 1501}, {"weight": 3308, "unit": "lb"}, {"unit": "oz"}, {"date": "2026-02-30"}):
            self.assertEqual(self.api.post("/api/weights", json={**base, **invalid}).status_code, 400)
        self.assertEqual(self.api.delete("/api/weights/bad-date").status_code, 400)
        start = datetime(2026, 1, 1)
        for offset in reversed(range(35)):
            self.assertEqual(self.api.post("/api/weights", json={"date": (start + timedelta(days=offset)).date().isoformat(), "weight": 70 + offset / 10, "unit": "kg"}).status_code, 200)
        entries = self.api.get("/api/weights").json["entries"]
        self.assertEqual(len(entries), 30)
        self.assertEqual(entries[0]["date"], "2026-01-06")
        self.assertEqual(entries[-1]["date"], "2026-02-04")
        self.assertEqual([row["date"] for row in entries], sorted(row["date"] for row in entries))


if __name__ == "__main__":
    unittest.main()
