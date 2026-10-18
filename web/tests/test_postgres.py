"""Run against TEST_DATABASE_URL; every run uses and removes its own schema."""
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import unittest
import uuid

from psycopg import errors, sql

from server.app import create_app
from server.auth import token_digest
from server.db import PostgresStore, connect, migrate


@unittest.skipUnless(os.getenv("TEST_DATABASE_URL"), "Set TEST_DATABASE_URL for the isolated PostgreSQL integration test.")
class PostgresIntegrationTests(unittest.TestCase):
    def test_migration_persistence_authentication_and_isolation(self):
        schema = "test_" + uuid.uuid4().hex
        connection = connect(os.environ["TEST_DATABASE_URL"])
        second = None
        try:
            connection.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
            connection.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
            # Recreate the pre-account schema to verify non-destructive migration.
            connection.execute("""CREATE TABLE food_entries (
                id UUID PRIMARY KEY, name TEXT NOT NULL, calories INTEGER NOT NULL CHECK (calories BETWEEN 0 AND 100000),
                entry_date DATE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
              CREATE TABLE lift_entries (
                id UUID PRIMARY KEY, exercise TEXT NOT NULL, weight DOUBLE PRECISION NOT NULL,
                unit TEXT NOT NULL, sets INTEGER NOT NULL, reps INTEGER NOT NULL,
                entry_date DATE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());""")
            legacy_id = str(uuid.uuid4())
            connection.execute("INSERT INTO food_entries (id,name,calories,entry_date) VALUES (%s,%s,%s,%s)", (legacy_id, "Legacy", 900, "2024-02-29"))
            # Include owned and unowned exercises from before the workout relationship.
            connection.execute((Path(__file__).parents[1] / "server/schema.sql").read_text().split("-- @workout-sessions")[0])
            legacy_owner = str(uuid.uuid4())
            connection.execute("INSERT INTO users (id, name, is_guest) VALUES (%s, 'Legacy guest', true)", (legacy_owner,))
            connection.execute("ALTER TABLE lift_entries ADD COLUMN account_id UUID REFERENCES users(id)")
            old_exercises = [str(uuid.uuid4()) for _ in range(3)]
            for index, exercise_id in enumerate(old_exercises):
                connection.execute("INSERT INTO lift_entries (id, exercise, weight, unit, sets, reps, entry_date, created_at, account_id) VALUES (%s, 'Legacy squat', 100, 'lb', 3, 8, '2024-02-29', '2024-02-29T12:34:56.789Z', %s)", (exercise_id, legacy_owner if index < 2 else None))
            migrate(connection)
            migrate(connection)
            self.assertEqual(connection.execute("SELECT count(*) AS n FROM workout_exercises").fetchone()["n"], 3)
            self.assertEqual(connection.execute("SELECT count(*) AS n FROM workout_sessions").fetchone()["n"], 2)
            # Each 3-set aggregate row expands to three set rows, once, however often migrate runs.
            self.assertEqual(connection.execute("SELECT count(*) AS n FROM exercise_sets").fetchone()["n"], 9)
            legacy_workouts = PostgresStore(lambda: connection).list_workouts("2024-02-29", legacy_owner)
            self.assertEqual(len(legacy_workouts), 1)
            self.assertEqual(len(legacy_workouts[0]["exercises"]), 2)
            # No catalog entry matches "Legacy squat": the typed name is preserved, not invented.
            self.assertEqual(legacy_workouts[0]["exercises"][0]["exercise"], "Legacy squat")
            self.assertIsNone(legacy_workouts[0]["exercises"][0]["exerciseId"])
            self.assertEqual([item["reps"] for item in legacy_workouts[0]["exercises"][0]["sets"]], [8, 8, 8])
            self.assertEqual(legacy_workouts[0]["createdAt"], "2024-02-29T12:34:56.789Z")
            self.assertFalse(legacy_workouts[0]["isCurrent"])
            legacy = connection.execute("SELECT account_id FROM food_entries WHERE id = %s", (legacy_id,)).fetchone()
            self.assertIsNone(legacy["account_id"])

            store = PostgresStore(lambda: connection)
            app = create_app(store, config={"TESTING": True, "CREDENTIAL_LIMIT": 100})
            api = app.test_client()
            self.assertEqual(api.get("/api/health").status_code, 200)
            self.assertEqual(api.get("/api/entries?date=2024-02-29").status_code, 401)
            registered = api.post("/api/auth/register", json={"name": "Rohit", "email": " ROHIT@example.com ", "password": "Correct horse 123"})
            self.assertEqual(registered.status_code, 201, registered.json)
            first_token = registered.json["token"]
            stored = connection.execute("SELECT password FROM users WHERE email = %s", ("rohit@example.com",)).fetchone()["password"]
            self.assertRegex(stored, r"^sha512\$[0-9a-f]{32}\$[0-9a-f]{128}$")
            self.assertNotIn("Correct horse 123", stored)
            self.assertEqual(api.get("/api/entries?date=2024-02-29").json["total"], 0)
            food = api.post("/api/entries", json={"name": "Soup'); DROP TABLE food_entries; --", "calories": 250, "date": "2024-02-29", "protein": 10, "carbs": 20, "fat": 5})
            self.assertEqual(food.status_code, 201, food.json)
            api.post("/api/entries", json={"name": "Bread", "calories": 150, "date": "2024-02-29"})
            api.post("/api/entries", json={"name": "Tomorrow", "calories": 900, "date": "2024-03-01"})
            lift = api.post("/api/lifts", json={"exercise": "Squat", "weight": 135, "unit": "lb", "sets": 3, "reps": 8, "date": "2024-02-29"})
            self.assertEqual(lift.status_code, 201, lift.json)
            self.assertEqual(lift.json["exercise"], "Back squat")
            self.assertEqual(api.post("/api/lifts", json={"exercise": "Made-up move", "weight": 1, "unit": "lb", "sets": 1, "reps": 1, "date": "2024-02-29"}).status_code, 400)
            for logged in (food, lift):
                self.assertRegex(logged.json["createdAt"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
            connection.execute("UPDATE food_entries SET created_at = %s WHERE id = %s", ("2024-02-29T13:47:29.123+02:00", food.json["id"]))

            # An independent connection verifies committed data and persisted sessions.
            second = connect(os.environ["TEST_DATABASE_URL"])
            second.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
            other_store = PostgresStore(lambda: second)
            independent = create_app(other_store, config={"CREDENTIAL_LIMIT": 100}).test_client(use_cookies=False)
            authorization = {"Authorization": f"Bearer {first_token}"}
            day = independent.get("/api/entries?date=2024-02-29", headers=authorization)
            self.assertEqual(day.json["total"], 400)
            self.assertEqual(day.json["entries"][0]["protein"], 10)
            self.assertEqual(day.json["entries"][0]["date"], "2024-02-29")
            self.assertEqual(day.json["entries"][0]["createdAt"], "2024-02-29T11:47:29.123Z")
            self.assertEqual(independent.get("/api/lifts?date=2024-02-29", headers=authorization).json["entries"][0]["createdAt"], lift.json["createdAt"])
            self.assertEqual(independent.get("/api/lifts?date=2024-02-29", headers=authorization).json["entries"][0]["weight"], 135)
            stranger = app.test_client()
            stranger.post("/api/auth/register", json={"name": "Sam", "email": "sam@example.com", "password": "Another password 123"})
            self.assertEqual(stranger.get("/api/entries?date=2024-02-29").json["total"], 0)
            self.assertEqual(stranger.get("/api/lifts?date=2024-02-29").json["entries"], [])
            self.assertEqual(stranger.delete(f"/api/entries/{food.json['id']}").status_code, 404)
            self.assertEqual(stranger.delete(f"/api/lifts/{lift.json['id']}").status_code, 404)
            with self.assertRaises(errors.CheckViolation):
                connection.execute("INSERT INTO food_entries (id,name,calories,entry_date) VALUES (%s,%s,%s,%s)", (str(uuid.uuid4()), "Bad", -1, "2024-02-29"))

            saved_food = api.post("/api/custom-foods", json={"name": "Homemade oats", "calories": 180, "protein": 0, "carbs": 25.5})
            self.assertEqual(saved_food.status_code, 201, saved_food.json)
            self.assertIsNone(saved_food.json["fat"])
            self.assertEqual(independent.get("/api/custom-foods", headers=authorization).json["foods"], [saved_food.json])
            self.assertEqual(stranger.get("/api/custom-foods").json["foods"], [])
            self.assertEqual(stranger.delete(f"/api/custom-foods/{saved_food.json['id']}").status_code, 404)
            self.assertEqual(api.post("/api/entries", json={**saved_food.json, "date": "2024-03-02"}).status_code, 201)
            self.assertEqual(api.delete(f"/api/custom-foods/{saved_food.json['id']}").status_code, 204)
            self.assertEqual(api.get("/api/entries?date=2024-03-02").json["entries"][0]["carbs"], 25.5)

            weight = api.post("/api/weights", json={"date": "2024-02-29", "weight": 75.5, "unit": "kg"})
            self.assertEqual(weight.status_code, 200, weight.json)
            self.assertEqual(weight.json["weightKg"], 75.5)
            changed_weight = api.post("/api/weights", json={"date": "2024-02-29", "weight": 165.25, "unit": "lb"})
            self.assertAlmostEqual(changed_weight.json["weightKg"], 165.25 * 0.45359237)
            self.assertEqual(len(independent.get("/api/weights", headers=authorization).json["entries"]), 1)
            self.assertEqual(stranger.get("/api/weights").json["entries"], [])
            self.assertEqual(stranger.delete("/api/weights/2024-02-29").status_code, 404)
            account_id = registered.json["user"]["id"]
            self.assertEqual(connection.execute("SELECT count(*) AS count FROM weight_entries WHERE account_id = %s", (account_id,)).fetchone()["count"], 1)
            with self.assertRaises(errors.CheckViolation):
                connection.execute("INSERT INTO weight_entries (account_id, entry_date, weight, unit) VALUES (%s,%s,%s,%s)", (account_id, "2024-03-01", 1501, "kg"))
            with connection.cursor() as cursor:
                cursor.executemany("INSERT INTO weight_entries (account_id, entry_date, weight, unit) VALUES (%s,%s,%s,%s)",
                                   [(account_id, (datetime(2024, 1, 1) + timedelta(days=offset)).date().isoformat(), 70 + offset / 10, "kg") for offset in range(31)])
            history = api.get("/api/weights").json["entries"]
            self.assertEqual(len(history), 30)
            self.assertEqual(history[0]["date"], "2024-01-03")
            self.assertEqual(history[-1]["date"], "2024-02-29")
            self.assertEqual(api.delete("/api/weights/2024-02-29").status_code, 204)
            self.assertEqual(api.delete("/api/weights/2024-02-29").status_code, 404)

            guest = app.test_client(use_cookies=False)
            guest_session = guest.post("/api/auth/guest").json["token"]
            guest_auth = {"Authorization": f"Bearer {guest_session}"}
            for method, path in (("get", "/api/weights"), ("post", "/api/weights"), ("delete", "/api/weights/2024-02-29")):
                self.assertEqual(getattr(guest, method)(path, json={"date": "2024-02-29", "weight": 70, "unit": "kg"}, headers=guest_auth).status_code, 403)
            guest_custom = guest.post("/api/custom-foods", json={"name": "Guest oats", "calories": 200}, headers=guest_auth)
            self.assertEqual(guest_custom.status_code, 201)
            guest_food = guest.post("/api/entries", json={"name": "Guest meal", "calories": 100, "date": "2024-02-29"}, headers=guest_auth)
            upgraded = guest.post("/api/auth/register", json={"name": "Guest", "email": "guest@example.com", "password": "A guest password 123"}, headers=guest_auth)
            self.assertEqual(upgraded.status_code, 201, upgraded.json)
            self.assertEqual(guest.get("/api/account", headers=guest_auth).status_code, 401)
            self.assertEqual(guest.get("/api/entries?date=2024-02-29", headers={"Authorization": f"Bearer {upgraded.json['token']}"}).json["total"], 100)
            self.assertEqual(guest.get("/api/custom-foods", headers={"Authorization": f"Bearer {upgraded.json['token']}"}).json["foods"], [guest_custom.json])
            migrate(connection)
            self.assertEqual(guest.get("/api/custom-foods", headers={"Authorization": f"Bearer {upgraded.json['token']}"}).json["foods"], [guest_custom.json])
            guest_owner = connection.execute("SELECT account_id FROM food_entries WHERE id = %s", (guest_food.json["id"],)).fetchone()["account_id"]
            self.assertEqual(str(guest_owner), upgraded.json["user"]["id"])

            login = independent.post("/api/auth/login", json={"email": "rohit@example.com", "password": "Correct horse 123"})
            second_token = login.json["token"]
            self.assertEqual(api.post("/api/account/password", json={"currentPassword": "Correct horse 123", "newPassword": "Changed password 123"}).status_code, 204)
            self.assertEqual(independent.get("/api/account", headers={"Authorization": f"Bearer {second_token}"}).status_code, 401)
            self.assertEqual(api.get("/api/account").status_code, 200)
            self.assertEqual(api.post("/api/auth/login", json={"email": "rohit@example.com", "password": "Correct horse 123"}).status_code, 401)
            self.assertEqual(api.patch("/api/account", json={"name": "New name"}).json["user"]["name"], "New name")
            self.assertEqual(api.delete(f"/api/lifts/{lift.json['id']}").status_code, 204)
            self.assertEqual(api.delete(f"/api/entries/{food.json['id']}").status_code, 204)
            self.assertEqual(api.get("/api/entries?date=2024-02-29").json["total"], 150)
            connection.execute("UPDATE account_sessions SET expires_at = %s WHERE token_digest = %s", (datetime.now(timezone.utc) - timedelta(seconds=1), token_digest(first_token)))
            self.assertEqual(api.get("/api/account").status_code, 401)
            self.assertEqual(connection.execute("SELECT count(*) AS count FROM food_entries WHERE id = %s AND account_id IS NULL", (legacy_id,)).fetchone()["count"], 1)

            # Two independently connected apps consume one shared credential budget.
            limited_one = create_app(store, config={"CREDENTIAL_LIMIT": 2}).test_client()
            limited_two = create_app(other_store, config={"CREDENTIAL_LIMIT": 2}).test_client()
            environment = {"REMOTE_ADDR": "203.0.113.10"}
            self.assertEqual(limited_one.post("/api/auth/login", json={}, environ_overrides=environment).status_code, 401)
            self.assertEqual(limited_two.post("/api/auth/login", json={}, environ_overrides=environment).status_code, 401)
            self.assertEqual(limited_one.post("/api/auth/login", json={}, environ_overrides=environment).status_code, 429)
        finally:
            if second:
                second.close()
            connection.execute("SET search_path TO public")
            connection.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(schema)))
            connection.close()

    def test_login_merges_guest_with_account_precedence_and_rejects_sql_payloads(self):
        schema = "test_" + uuid.uuid4().hex
        connection = connect(os.environ["TEST_DATABASE_URL"])
        try:
            connection.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
            connection.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
            migrate(connection)
            app = create_app(PostgresStore(lambda: connection), config={"TESTING": True, "CREDENTIAL_LIMIT": 100})
            account = app.test_client()
            registered = account.post("/api/auth/register", json={"name": "Keep profile", "email": "merge@example.test", "password": "Account password 123"}).json
            account_id = registered["user"]["id"]
            day = "2026-10-18"
            meal = {"name": "Toast", "calories": 200, "date": day}
            owned_food = account.post("/api/entries", json=meal).json
            owned_custom = account.post("/api/custom-foods", json={"name": "Oats", "calories": 100}).json
            owned_weight = account.post("/api/weights", json={"date": day, "weight": 70, "unit": "kg"}).json
            owned_workout = account.post("/api/workouts", json={"name": "Push", "date": day}).json
            bench = connection.execute("SELECT id FROM exercises WHERE slug = 'bench-press'").fetchone()["id"]
            exercise = {"exerciseId": str(bench), "sets": [{"reps": 8, "weight": 135, "unit": "lb"}] * 3}
            owned_exercise = account.post(f"/api/workouts/{owned_workout['id']}/exercises", json=exercise).json
            # Exercise the identical handler with browser cookies and mobile bearer auth.
            for mobile in (False, True):
                guest = app.test_client(use_cookies=not mobile)
                token = guest.post("/api/auth/guest").json["token"]
                headers = {"Authorization": f"Bearer {token}"} if mobile else {}
                guest_owner = str(connection.execute("SELECT account_id FROM account_sessions WHERE token_digest = %s", (token_digest(token),)).fetchone()["account_id"])
                same_name_food = guest.post("/api/entries", json={**meal, "name": " toast ", "calories": 900}, headers=headers).json
                unique_food = guest.post("/api/entries", json={**meal, "name": f"Guest snack {mobile}"}, headers=headers).json
                guest.post("/api/custom-foods", json={"name": " OATS ", "calories": 100}, headers=headers)
                variant_custom = guest.post("/api/custom-foods", json={"name": " OATS ", "calories": 998 + int(mobile)}, headers=headers).json
                unique_custom = guest.post("/api/custom-foods", json={"name": f"Guest food {mobile}", "calories": 90}, headers=headers).json
                # Guests cannot log weights through the API; migrate a historical fixture.
                connection.execute("INSERT INTO weight_entries (account_id, entry_date, weight, unit) VALUES (%s, %s, 99, 'kg')", (guest_owner, day))
                overlap = guest.post("/api/workouts", json={"name": " push ", "date": day}, headers=headers).json
                overlap_exercise = guest.post(f"/api/workouts/{overlap['id']}/exercises", json={**exercise, "sets": [{"reps": 8, "weight": 999, "unit": "lb"}]}, headers=headers).json
                self.assertEqual(guest.post(f"/api/workouts/{overlap['id']}/end", headers=headers).status_code, 200)
                unique_workout = guest.post("/api/workouts", json={"name": f"Guest pull {mobile}", "date": day}, headers=headers).json
                unique_exercise = guest.post(f"/api/workouts/{unique_workout['id']}/exercises", json=exercise, headers=headers).json
                invalid = guest.post("/api/auth/login", json={"email": "merge@example.test", "password": "Wrong password 123"}, headers=headers)
                self.assertEqual(invalid.status_code, 401)
                self.assertEqual(guest.get("/api/account", headers=headers).status_code, 200)
                # A failed new-session insert must roll back the whole guest transfer.
                with self.assertRaises(errors.UniqueViolation):
                    app.extensions["avocado_store"].create_session(token_digest(registered["token"]), account_id, datetime.now(timezone.utc) + timedelta(days=30), guest_id=guest_owner)
                self.assertEqual(guest.get("/api/account", headers=headers).status_code, 200)
                login = guest.post("/api/auth/login", json={"email": "merge@example.test", "password": "Account password 123"}, headers=headers)
                self.assertEqual(login.status_code, 200, login.json)
                self.assertEqual(login.json["user"], registered["user"])
                self.assertNotEqual(login.json["token"], token)
                self.assertEqual(guest.get("/api/account", headers={"Authorization": f"Bearer {token}"}).status_code, 401)
                self.assertIsNone(connection.execute("SELECT id FROM users WHERE id = %s", (guest_owner,)).fetchone())
                foods = account.get(f"/api/entries?date={day}").json["entries"]
                self.assertIn(owned_food, foods)
                self.assertIn(unique_food, foods)
                # Same-name meals are separate servings and must not be discarded.
                self.assertIn(same_name_food, foods)
                custom = account.get("/api/custom-foods").json["foods"]
                self.assertIn(owned_custom, custom)
                self.assertIn(unique_custom, custom)
                self.assertIn(variant_custom, custom)
                self.assertEqual(sum(1 for food in custom if food["name"].strip().lower() == "oats" and food["calories"] == 100), 1)
                self.assertEqual(account.get("/api/weights").json["entries"], [owned_weight])
                workouts = account.get(f"/api/workouts?date={day}").json["workouts"]
                self.assertEqual(next(item for item in workouts if item["id"] == owned_workout["id"])["exercises"], [owned_exercise])
                self.assertEqual(next(item for item in workouts if item["id"] == unique_workout["id"])["exercises"], [unique_exercise])
                self.assertEqual([item["id"] for item in workouts if item["isCurrent"]], [owned_workout["id"]])
                # A same-name guest workout transfers as its own historical workout.
                transferred = next(item for item in workouts if item["id"] == overlap["id"])
                self.assertFalse(transferred["isCurrent"])
                self.assertEqual(transferred["exercises"], [overlap_exercise])
                self.assertEqual(account.get("/api/account").json["user"]["id"], account_id)
            # Both payloads reach login validation/query handling, but neither authenticates.
            attacker = app.test_client()
            for email, password in (("x'/**/OR/**/1=1--@example.test", "Account password 123"), ("merge@example.test", "' OR '1'='1' --"), ("x@example.test';DROP/**/TABLE/**/users;--", "Account password 123")):
                response = attacker.post("/api/auth/login", json={"email": email, "password": password})
                self.assertEqual(response.status_code, 401, response.json)
                self.assertEqual(response.json, {"error": "Email or password is incorrect."})
                self.assertEqual(attacker.get("/api/account").status_code, 401)
            self.assertEqual(connection.execute("SELECT count(*) AS n FROM users").fetchone()["n"], 1)
        finally:
            connection.execute("SET search_path TO public")
            connection.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(schema)))
            connection.close()

    def test_named_workouts_own_exercises_and_share_one_current_workout(self):
        schema = "test_" + uuid.uuid4().hex
        connection = connect(os.environ["TEST_DATABASE_URL"])
        try:
            connection.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
            connection.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
            migrate(connection)
            app = create_app(PostgresStore(lambda: connection), config={"TESTING": True})
            api, stranger = app.test_client(), app.test_client()
            api.post("/api/auth/guest")
            owner = connection.execute("SELECT id FROM users").fetchone()["id"]
            stranger.post("/api/auth/guest")
            self.assertEqual(api.get("/api/workouts?date=bad").status_code, 400)
            for invalid in ({"name": " ", "date": "2026-10-18"}, {"name": "x" * 121, "date": "2026-10-18"}, {"name": "Push", "date": "2026-02-30"}):
                self.assertEqual(api.post("/api/workouts", json=invalid).status_code, 400)
            first = api.post("/api/workouts", json={"name": " Morning push ", "date": "2026-10-18"})
            self.assertEqual(first.status_code, 201, first.json)
            self.assertEqual(first.json["name"], "Morning push")
            self.assertTrue(first.json["isCurrent"])
            first_path = f"/api/workouts/{first.json['id']}/exercises"
            bench = str(connection.execute("SELECT id FROM exercises WHERE slug = 'bench-press'").fetchone()["id"])
            exercise = {"exerciseId": bench, "sets": [{"reps": 8, "weight": 135, "unit": "lb"}, {"reps": 6, "weight": 145, "unit": "lb"}]}
            saved = api.post(first_path, json=exercise)
            self.assertEqual(saved.status_code, 201, saved.json)
            self.assertEqual(saved.json["exercise"], "Bench press")
            self.assertEqual([(item["setNumber"], item["reps"], item["weight"]) for item in saved.json["sets"]], [(1, 8, 135), (2, 6, 145)])
            # Clients log against the app-owned catalog; unknown IDs and catalog writes are refused.
            catalog = api.get("/api/exercises").json["exercises"]
            self.assertIn({"id": bench, "slug": "bench-press", "name": "Bench press", "category": "chest"}, catalog)
            self.assertEqual(api.post(first_path, json={**exercise, "exerciseId": str(uuid.uuid4())}).status_code, 400)
            self.assertEqual(api.post("/api/exercises", json={"name": "Mine"}).status_code, 405)
            self.assertEqual(stranger.get("/api/workouts?date=2026-10-18").json["workouts"], [])
            self.assertEqual(stranger.post(first_path, json=exercise).status_code, 404)
            self.assertEqual(stranger.delete(f"{first_path}/{saved.json['id']}").status_code, 404)
            one = {"reps": 8, "weight": 135, "unit": "lb"}
            for invalid in ({"sets": []}, {"sets": [one] * 101}, {"sets": [{**one, "weight": -1}]}, {"sets": [{**one, "unit": "oz"}]},
                            {"sets": [{**one, "reps": True}]}, {"exerciseId": "bench"}, {"sets": 3}):
                self.assertEqual(api.post(first_path, json={**exercise, **invalid}).status_code, 400)
            # A workout in progress blocks new starts until it is ended; strangers cannot end it.
            self.assertEqual(api.post("/api/workouts", json={"name": "Evening pull", "date": "2026-10-18"}).status_code, 409)
            self.assertEqual(stranger.post(f"/api/workouts/{first.json['id']}/end").status_code, 404)
            ended = api.post(f"/api/workouts/{first.json['id']}/end")
            self.assertEqual(ended.status_code, 200, ended.json)
            self.assertFalse(ended.json["isCurrent"])
            self.assertEqual(api.post(f"/api/workouts/{first.json['id']}/end").status_code, 404)
            second = api.post("/api/workouts", json={"name": "Evening pull", "date": "2026-10-18"}).json
            day = api.get("/api/workouts?date=2026-10-18").json["workouts"]
            self.assertEqual(len(day), 2)
            self.assertEqual([item["isCurrent"] for item in day], [False, True])
            self.assertEqual(day[0]["exercises"], [saved.json])
            self.assertEqual(day[1]["exercises"], [])
            self.assertEqual(api.post(first_path, json=exercise).status_code, 404)
            self.assertEqual(api.delete(f"{first_path}/{saved.json['id']}").status_code, 404)
            second_path = f"/api/workouts/{second['id']}/exercises"
            latest = api.post(second_path, json=exercise).json
            self.assertEqual(api.delete(f"{second_path}/{saved.json['id']}").status_code, 404)
            self.assertEqual(api.delete(f"{second_path}/{latest['id']}").status_code, 204)
            other_day = api.get("/api/workouts?date=2026-10-17").json
            self.assertEqual((other_day["workouts"], other_day["current"]["id"]), ([], second["id"]))
            self.assertIsNone(stranger.get("/api/workouts?date=2026-10-18").json["current"])
            self.assertEqual(api.post(f"/api/workouts/{second['id']}/end").status_code, 200)
            self.assertIsNone(api.get("/api/workouts?date=2026-10-18").json["current"])
            self.assertEqual(api.post("/api/workouts", json={"name": "Tomorrow", "date": "2026-10-19"}).status_code, 201)
            self.assertTrue(all(not item["isCurrent"] for item in api.get("/api/workouts?date=2026-10-18").json["workouts"]))
            self.assertEqual(connection.execute("SELECT count(*) AS n FROM workout_sessions WHERE user_id = %s AND is_current", (owner,)).fetchone()["n"], 1)
            with self.assertRaises(errors.UniqueViolation):
                connection.execute("UPDATE workout_sessions SET is_current = true WHERE id = %s", (second["id"],))
            with self.assertRaises(errors.ForeignKeyViolation):
                connection.execute("UPDATE workout_exercises SET session_id = %s WHERE id = %s", (str(uuid.uuid4()), saved.json["id"]))
            self.assertEqual(api.post("/api/auth/register", json={"name": "Mobile", "email": "workouts@example.com", "password": "Workout password 123"}).status_code, 201)
            self.assertEqual(api.get("/api/workouts?date=2026-10-18").json["workouts"][0]["exercises"], [saved.json])
            migrate(connection)
            self.assertEqual(len(api.get("/api/workouts?date=2026-10-18").json["workouts"]), 2)
            connection.execute("DELETE FROM workout_sessions WHERE id = %s", (first.json["id"],))
            self.assertIsNone(connection.execute("SELECT id FROM workout_exercises WHERE id = %s", (saved.json["id"],)).fetchone())
            self.assertEqual(connection.execute("SELECT count(*) AS n FROM exercise_sets WHERE workout_exercise_id = %s", (saved.json["id"],)).fetchone()["n"], 0)
        finally:
            connection.execute("SET search_path TO public")
            connection.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(schema)))
            connection.close()


    def test_previous_workout_schema_migrates_to_catalog_sessions_and_sets(self):
        """The Oct 18 shape (accounts, workouts, aggregate workout_exercises) converges without loss."""
        schema = "test_" + uuid.uuid4().hex
        connection = connect(os.environ["TEST_DATABASE_URL"])
        try:
            connection.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
            connection.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
            connection.execute((Path(__file__).parent / "fixtures/schema_before_exercise_sets.sql").read_text())
            owner, stranger_owner = str(uuid.uuid4()), str(uuid.uuid4())
            for account in (owner, stranger_owner):
                connection.execute("INSERT INTO accounts (id, name, is_guest) VALUES (%s, 'Guest', true)", (account,))
            current, history, other = (str(uuid.uuid4()) for _ in range(3))
            connection.execute("INSERT INTO workouts (id, account_id, name, entry_date, is_current, created_at) VALUES (%s, %s, 'Push', '2026-10-18', true, '2026-10-18T10:00:00Z'), (%s, %s, 'Legs', '2026-10-17', false, '2026-10-17T10:00:00Z'), (%s, %s, 'Theirs', '2026-10-18', true, '2026-10-18T09:00:00Z')",
                               (current, owner, history, owner, other, stranger_owner))
            rows = {"bench": (current, " bench ", 135, "lb", 3, 8), "custom": (current, "Zercher carry", 60, "kg", 2, 30), "squat": (history, "Back Squat", 225, "lb", 5, 5), "theirs": (other, "Deadlift", 315, "lb", 1, 3)}
            ids = {key: str(uuid.uuid4()) for key in rows}
            for key, (workout, name, weight, unit, sets, reps) in rows.items():
                connection.execute("INSERT INTO workout_exercises (id, workout_id, exercise, weight, unit, sets, reps, created_at) VALUES (%s, %s, %s, %s, %s, %s, %s, '2026-10-18T10:05:00.123Z')",
                                   (ids[key], workout, name, weight, unit, sets, reps))
            migrate(connection)
            migrate(connection)
            self.assertIsNone(connection.execute("SELECT to_regclass('accounts') AS t").fetchone()["t"])
            self.assertIsNone(connection.execute("SELECT to_regclass('workouts') AS t").fetchone()["t"])
            self.assertEqual(connection.execute("SELECT count(*) AS n FROM users").fetchone()["n"], 2)
            self.assertEqual(connection.execute("SELECT count(*) AS n FROM exercise_sets").fetchone()["n"], 3 + 2 + 5 + 1)
            store = PostgresStore(lambda: connection)
            today = store.list_workouts("2026-10-18", owner)
            self.assertEqual([(str(item["id"]), item["isCurrent"]) for item in today], [(current, True)])
            exercises = {str(item["id"]): item for item in today[0]["exercises"]}
            # Original IDs and timestamps survive; aliases/case map to the catalog; unknown names stay as typed.
            self.assertEqual(exercises[ids["bench"]]["exercise"], "Bench press")
            self.assertIsNotNone(exercises[ids["bench"]]["exerciseId"])
            self.assertEqual(exercises[ids["bench"]]["createdAt"], "2026-10-18T10:05:00.123Z")
            self.assertEqual([(s["setNumber"], s["reps"], s["weight"], s["unit"]) for s in exercises[ids["bench"]]["sets"]], [(1, 8, 135, "lb"), (2, 8, 135, "lb"), (3, 8, 135, "lb")])
            self.assertEqual(exercises[ids["custom"]]["exercise"], "Zercher carry")
            self.assertIsNone(exercises[ids["custom"]]["exerciseId"])
            self.assertEqual(store.list_workouts("2026-10-17", owner)[0]["exercises"][0]["exercise"], "Back squat")
            self.assertEqual(next(item for item in store.list_lifts("2026-10-18", owner) if str(item["id"]) == ids["bench"])["sets"], 3)
            self.assertEqual(str(store.list_workouts("2026-10-18", stranger_owner)[0]["exercises"][0]["id"]), ids["theirs"])
            # Ownership still flows through the session: another user cannot touch these rows.
            self.assertFalse(store.remove_exercise(current, ids["bench"], stranger_owner))
            self.assertFalse(store.remove_lift(ids["bench"], stranger_owner))
            self.assertEqual(connection.execute("SELECT count(*) AS n FROM workout_sessions WHERE is_current").fetchone()["n"], 2)
        finally:
            connection.execute("SET search_path TO public")
            connection.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(schema)))
            connection.close()

    def test_exercise_progress_is_shared_scoped_and_suggests_overload(self):
        schema = "test_" + uuid.uuid4().hex
        connection = connect(os.environ["TEST_DATABASE_URL"])
        try:
            connection.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
            connection.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
            migrate(connection)
            app = create_app(PostgresStore(lambda: connection), config={"TESTING": True})
            api, stranger = app.test_client(), app.test_client()
            api.post("/api/auth/guest"); stranger.post("/api/auth/guest")
            bench = str(connection.execute("SELECT id FROM exercises WHERE slug = 'bench-press'").fetchone()["id"])
            pullup = str(connection.execute("SELECT id FROM exercises WHERE slug = 'pull-up'").fetchone()["id"])
            path = f"/api/exercises/{bench}/progress"
            self.assertEqual(api.get(path).json, {"sessions": [], "lastSession": None, "suggestion": None, "bestE1rmKg": None})
            self.assertEqual(api.get("/api/exercises/nope/progress").status_code, 400)
            history = [("2026-10-10", [(10, 95), (8, 135), (8, 135), (8, 135)]), ("2026-10-14", [(8, 140), (8, 140), (7, 140)])]
            for day, sets in history:
                workout = api.post("/api/workouts", json={"name": "Push", "date": day}).json
                api.post(f"/api/workouts/{workout['id']}/exercises", json={"exerciseId": bench, "sets": [{"reps": r, "weight": w, "unit": "lb"} for r, w in sets]})
                api.post(f"/api/workouts/{workout['id']}/exercises", json={"exerciseId": pullup, "sets": [{"reps": 9, "weight": 0, "unit": "lb"}]})
                api.post(f"/api/workouts/{workout['id']}/end")
            # Sets logged today, in the workout in progress, appear in history but don't move the target.
            today = api.post("/api/workouts", json={"name": "Push", "date": "2026-10-18"}).json
            api.post(f"/api/workouts/{today['id']}/exercises", json={"exerciseId": bench, "sets": [{"reps": 8, "weight": 145, "unit": "lb"}]})
            progress = api.get(path).json
            self.assertEqual([item["date"] for item in progress["sessions"]], ["2026-10-10", "2026-10-14", "2026-10-18"])
            self.assertEqual(progress["sessions"][0]["topSet"], {"reps": 8, "weight": 135, "unit": "lb"})
            self.assertEqual(progress["lastSession"]["date"], "2026-10-14")
            self.assertEqual(progress["suggestion"]["same"], {"weight": 140, "unit": "lb", "reps": 7, "sets": 3})
            self.assertEqual([(o["kind"], o["weight"], o["reps"]) for o in progress["suggestion"]["options"]], [("weight", 145, 7), ("reps", 140, 8)])
            self.assertAlmostEqual(progress["bestE1rmKg"], round(145 * 0.45359237 * (1 + 8 / 30), 2), places=2)
            summary = {item["name"]: item for item in api.get("/api/progress").json["exercises"]}
            self.assertEqual(summary["Bench press"]["sessions"], 3)
            self.assertEqual(summary["Bench press"]["lastDate"], "2026-10-18")
            self.assertAlmostEqual(summary["Bench press"]["latestE1rmKg"], progress["sessions"][-1]["e1rmKg"], places=1)
            self.assertAlmostEqual(summary["Bench press"]["firstE1rmKg"], progress["sessions"][0]["e1rmKg"], places=1)
            self.assertEqual((summary["Pull-up"]["bestE1rmKg"], summary["Pull-up"]["maxReps"]), (0, 9))
            # Max-weight view used by the Progress page: latest top set 145 lb × 8, first 135 lb.
            bench_summary = summary["Bench press"]
            self.assertAlmostEqual(bench_summary["latestWeightKg"], round(145 * 0.45359237, 2), places=2)
            self.assertAlmostEqual(bench_summary["firstWeightKg"], round(135 * 0.45359237, 2), places=2)
            self.assertEqual(bench_summary["latestReps"], 8)
            self.assertEqual(bench_summary["bestWeightKg"], bench_summary["latestWeightKg"])
            # Another user's history is never visible, even with the same catalog exercise.
            self.assertEqual(stranger.get(path).json["sessions"], [])
            self.assertEqual(stranger.get("/api/progress").json["exercises"], [])
        finally:
            connection.execute("SET search_path TO public")
            connection.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(schema)))
            connection.close()

    def test_sets_are_logged_individually_and_exercises_can_form_supersets(self):
        schema = "test_" + uuid.uuid4().hex
        connection = connect(os.environ["TEST_DATABASE_URL"])
        try:
            connection.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
            connection.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
            migrate(connection)
            migrate(connection)
            app = create_app(PostgresStore(lambda: connection), config={"TESTING": True})
            api, stranger = app.test_client(), app.test_client()
            api.post("/api/auth/guest"); stranger.post("/api/auth/guest")
            ids = {slug: str(connection.execute("SELECT id FROM exercises WHERE slug = %s", (slug,)).fetchone()["id"]) for slug in ("bench-press", "barbell-row", "lateral-raise")}
            workout = api.post("/api/workouts", json={"name": "Upper", "date": "2026-10-18"}).json
            base = f"/api/workouts/{workout['id']}/exercises"
            one = lambda reps, weight: {"reps": reps, "weight": weight, "unit": "lb"}
            bench = api.post(base, json={"exerciseId": ids["bench-press"], "sets": [one(8, 135)]}).json
            # Log further sets one at a time; each becomes its own row owned by the exercise.
            for reps, weight in ((8, 140), (6, 145)):
                bench = api.post(f"{base}/{bench['id']}/sets", json=one(reps, weight)).json
            self.assertEqual([(s["setNumber"], s["reps"], s["weight"]) for s in bench["sets"]], [(1, 8, 135), (2, 8, 140), (3, 6, 145)])
            for invalid in ({"reps": 0, "weight": 1, "unit": "lb"}, {"reps": 5, "weight": -1, "unit": "lb"}, {"reps": 5, "weight": 1, "unit": "oz"}):
                self.assertEqual(api.post(f"{base}/{bench['id']}/sets", json=invalid).status_code, 400)
            self.assertEqual(stranger.post(f"{base}/{bench['id']}/sets", json=one(5, 5)).status_code, 404)
            # A superset: the row is created alongside bench, sharing one superset id.
            row = api.post(base, json={"exerciseId": ids["barbell-row"], "supersetWith": bench["id"], "sets": [one(10, 95)]}).json
            self.assertIsNotNone(row["supersetId"])
            day = api.get("/api/workouts?date=2026-10-18").json["workouts"][0]["exercises"]
            self.assertEqual({str(e["supersetId"]) for e in day}, {str(row["supersetId"])})
            self.assertEqual(api.post(base, json={"exerciseId": ids["lateral-raise"], "supersetWith": str(uuid.uuid4()), "sets": [one(12, 15)]}).status_code, 400)
            raise_ = api.post(base, json={"exerciseId": ids["lateral-raise"], "sets": [one(12, 15)]}).json
            self.assertIsNone(raise_["supersetId"])
            # Link an existing exercise into the superset, then leave it again.
            linked = api.put(f"{base}/{raise_['id']}/superset", json={"with": row["id"]}).json["supersets"]
            self.assertEqual(len({value for value in linked.values()}), 1)  # all three merge into one superset
            self.assertEqual(api.put(f"{base}/{raise_['id']}/superset", json={"with": raise_["id"]}).status_code, 404)
            self.assertEqual(stranger.put(f"{base}/{raise_['id']}/superset", json={"with": row["id"]}).status_code, 404)
            left = api.put(f"{base}/{raise_['id']}/superset", json={"with": None}).json["supersets"]
            self.assertIsNone(left[raise_["id"]])
            self.assertIsNotNone(left[bench["id"]])
            # Removing a set shifts later sets down; removing the last set removes the exercise
            # and dissolves a superset left with one member.
            first_row_set = row["sets"][0]["id"]
            self.assertEqual(stranger.delete(f"{base}/{row['id']}/sets/{first_row_set}").status_code, 404)
            gone = api.delete(f"{base}/{row['id']}/sets/{first_row_set}").json
            self.assertIsNone(gone["exercise"])
            day = {e["id"]: e for e in api.get("/api/workouts?date=2026-10-18").json["workouts"][0]["exercises"]}
            self.assertNotIn(row["id"], day)
            self.assertIsNone(day[bench["id"]]["supersetId"])
            kept = api.delete(f"{base}/{bench['id']}/sets/{bench['sets'][1]['id']}").json["exercise"]
            self.assertEqual([(s["setNumber"], s["weight"]) for s in kept["sets"]], [(1, 135), (2, 145)])
            # Ended workouts are history: no more sets or superset changes.
            api.post(f"/api/workouts/{workout['id']}/end")
            self.assertEqual(api.post(f"{base}/{bench['id']}/sets", json=one(5, 150)).status_code, 404)
            self.assertEqual(api.put(f"{base}/{bench['id']}/superset", json={"with": raise_["id"]}).status_code, 404)
        finally:
            connection.execute("SET search_path TO public")
            connection.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(schema)))
            connection.close()

    def test_deleting_a_set_frees_a_slot_under_the_100_set_limit(self):
        schema = "test_" + uuid.uuid4().hex
        connection = connect(os.environ["TEST_DATABASE_URL"])
        try:
            connection.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
            connection.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
            migrate(connection)
            app = create_app(PostgresStore(lambda: connection), config={"TESTING": True})
            api = app.test_client()
            api.post("/api/auth/guest")
            bench = str(connection.execute("SELECT id FROM exercises WHERE slug = 'bench-press'").fetchone()["id"])
            workout = api.post("/api/workouts", json={"name": "Volume", "date": "2026-10-18"}).json
            base = f"/api/workouts/{workout['id']}/exercises"
            entry = api.post(base, json={"exerciseId": bench, "sets": [{"reps": 5, "weight": w, "unit": "lb"} for w in range(100)]}).json
            self.assertEqual(api.post(f"{base}/{entry['id']}/sets", json={"reps": 5, "weight": 1, "unit": "lb"}).status_code, 400)
            # Delete set 1 (99 remain): the next append takes number 100 instead of being rejected.
            kept = api.delete(f"{base}/{entry['id']}/sets/{entry['sets'][0]['id']}").json["exercise"]
            self.assertEqual([s["setNumber"] for s in kept["sets"]], list(range(1, 100)))
            appended = api.post(f"{base}/{entry['id']}/sets", json={"reps": 5, "weight": 500, "unit": "lb"})
            self.assertEqual(appended.status_code, 201)
            self.assertEqual((appended.json["sets"][-1]["setNumber"], appended.json["sets"][-1]["weight"]), (100, 500))
            self.assertEqual(api.post(f"{base}/{entry['id']}/sets", json={"reps": 5, "weight": 1, "unit": "lb"}).status_code, 400)
            # A database from before this fix (non-deferrable constraint, gaps from deletes) is compacted
            # in order by a rerun of the migration, and a further rerun changes nothing.
            connection.execute("ALTER TABLE exercise_sets DROP CONSTRAINT exercise_sets_workout_exercise_id_set_number_key")
            connection.execute("ALTER TABLE exercise_sets ADD CONSTRAINT exercise_sets_workout_exercise_id_set_number_key UNIQUE (workout_exercise_id, set_number)")
            connection.execute("DELETE FROM exercise_sets WHERE workout_exercise_id = %s AND set_number IN (2, 50)", (entry["id"],))
            before = [r["weight"] for r in connection.execute("SELECT weight FROM exercise_sets WHERE workout_exercise_id = %s ORDER BY set_number", (entry["id"],)).fetchall()]
            migrate(connection)
            migrate(connection)
            rows = connection.execute("SELECT set_number, weight FROM exercise_sets WHERE workout_exercise_id = %s ORDER BY set_number", (entry["id"],)).fetchall()
            self.assertEqual([r["set_number"] for r in rows], list(range(1, len(before) + 1)))
            self.assertEqual([r["weight"] for r in rows], before)
            self.assertTrue(connection.execute("SELECT condeferrable FROM pg_constraint WHERE conname = 'exercise_sets_workout_exercise_id_set_number_key' AND conrelid = 'exercise_sets'::regclass").fetchone()["condeferrable"])
        finally:
            connection.execute("SET search_path TO public")
            connection.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(schema)))
            connection.close()

if __name__ == "__main__":
    unittest.main()
