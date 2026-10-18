"""Shared base for tests that run the real app against PostgreSQL with one connection per request.

Each test gets its own schema; no store is injected, so requests go through the same
connect/transaction code a Gunicorn worker uses.
"""
import os
import unittest
import uuid
from urllib.parse import quote

from psycopg import sql

from server.app import create_app
from server.db import connect, migrate

TEST_URL = os.getenv("TEST_DATABASE_URL")


@unittest.skipUnless(TEST_URL, "Set TEST_DATABASE_URL for the live PostgreSQL tests.")
class LiveAppCase(unittest.TestCase):
    def setUp(self):
        self.schema = "race_" + uuid.uuid4().hex
        self.admin = connect(TEST_URL)
        self.admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(self.schema)))
        self.admin.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(self.schema)))
        migrate(self.admin)
        # Every request connection lands in this test's schema via the libpq options parameter.
        self.previous_url = os.environ.get("DATABASE_URL")
        separator = "&" if "?" in TEST_URL else "?"
        os.environ["DATABASE_URL"] = f"{TEST_URL}{separator}options={quote(f'-csearch_path={self.schema}')}"
        self.app = create_app(config={"TESTING": True, "CREDENTIAL_LIMIT": 1000})

    def tearDown(self):
        if self.previous_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = self.previous_url
        self.admin.execute("SET search_path TO public")
        self.admin.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(self.schema)))
        self.admin.close()

    def client(self, token):
        client = self.app.test_client(use_cookies=False)
        client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {token}"
        return client

    def guest_token(self):
        return self.app.test_client(use_cookies=False).post("/api/auth/guest").json["token"]

    def catalog_id(self, slug):
        return str(self.admin.execute("SELECT id FROM exercises WHERE slug = %s", (slug,)).fetchone()["id"])

    def workout_with_exercise(self, token, sets=1):
        api = self.client(token)
        workout = api.post("/api/workouts", json={"name": "Race", "date": "2026-10-18"}).json
        entry = api.post(f"/api/workouts/{workout['id']}/exercises", json={"exerciseId": self.catalog_id("bench-press"), "sets": [{"reps": 5, "weight": 100, "unit": "lb"}] * sets}).json
        return workout, entry

