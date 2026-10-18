import os
from pathlib import Path

import psycopg
from psycopg.rows import dict_row


def connect(connection_string=None, **kwargs):
    dsn = connection_string or os.getenv("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL is required. Copy .env.example to .env first.")
    return psycopg.connect(dsn, connect_timeout=5, autocommit=True, row_factory=dict_row, **kwargs)


def migrate(connection):
    connection.execute(Path(__file__).with_name("schema.sql").read_text())


class PostgresStore:
    ACCOUNT_COLUMNS = "id, name, email, is_guest"
    FOOD_COLUMNS = "id, name, calories, protein, carbs, fat, to_char(entry_date, 'YYYY-MM-DD') AS date"
    LIFT_COLUMNS = "id, exercise, weight, unit, sets, reps, to_char(entry_date, 'YYYY-MM-DD') AS date"

    def __init__(self, connection):
        self.connection = connection

    def execute(self, sql, params=()):
        return self.connection().execute(sql, params)

    def health(self):
        self.execute("SELECT 1")

    def allow_credentials(self, client_key, window_start, limit=20):
        row = self.execute("""INSERT INTO auth_rate_limits (client_key, window_start, attempts) VALUES (%s, %s, 1)
          ON CONFLICT (client_key) DO UPDATE SET
            attempts = CASE WHEN auth_rate_limits.window_start = EXCLUDED.window_start THEN auth_rate_limits.attempts + 1 ELSE 1 END,
            window_start = EXCLUDED.window_start RETURNING attempts""", (client_key, window_start)).fetchone()
        self.execute("DELETE FROM auth_rate_limits WHERE window_start < %s", (window_start - 900,))
        return row["attempts"] <= limit

    def create_account(self, account):
        try:
            return self.execute(f"INSERT INTO accounts (id, name, email, password, is_guest) VALUES (%s, %s, %s, %s, %s) RETURNING {self.ACCOUNT_COLUMNS}",
                                (account["id"], account["name"], account.get("email"), account.get("password"), account.get("is_guest", False))).fetchone()
        except psycopg.errors.UniqueViolation:
            return None

    def upgrade_guest(self, account_id, account):
        try:
            return self.execute(f"""WITH updated AS (
                UPDATE accounts SET name = %s, email = %s, password = %s, is_guest = false
                WHERE id = %s AND is_guest = true RETURNING {self.ACCOUNT_COLUMNS}
              ), revoked AS (DELETE FROM account_sessions WHERE account_id IN (SELECT id FROM updated))
              SELECT * FROM updated""", (account["name"], account["email"], account["password"], account_id)).fetchone()
        except psycopg.errors.UniqueViolation:
            return None

    def account_by_email(self, email):
        return self.execute(f"SELECT {self.ACCOUNT_COLUMNS}, password FROM accounts WHERE email = %s", (email,)).fetchone()

    def account_by_id(self, account_id):
        return self.execute(f"SELECT {self.ACCOUNT_COLUMNS}, password FROM accounts WHERE id = %s", (account_id,)).fetchone()

    def update_account(self, account_id, name):
        return self.execute(f"UPDATE accounts SET name = %s WHERE id = %s RETURNING {self.ACCOUNT_COLUMNS}", (name, account_id)).fetchone()

    def create_session(self, digest, account_id, expires_at):
        self.execute("INSERT INTO account_sessions (token_digest, account_id, expires_at) VALUES (%s, %s, %s)", (digest, account_id, expires_at))
        self.execute("DELETE FROM account_sessions WHERE expires_at <= now()")

    def session_account(self, digest):
        return self.execute("""SELECT a.id, a.name, a.email, a.is_guest FROM accounts a JOIN account_sessions s ON s.account_id = a.id
            WHERE s.token_digest = %s AND s.expires_at > now()""", (digest,)).fetchone()

    def remove_session(self, digest):
        self.execute("DELETE FROM account_sessions WHERE token_digest = %s", (digest,))

    def change_password(self, account_id, previous_password, password, current_session):
        return self.execute("""WITH updated AS (
            UPDATE accounts SET password = %s WHERE id = %s AND password = %s RETURNING id
          ), revoked AS (
            DELETE FROM account_sessions WHERE account_id IN (SELECT id FROM updated) AND token_digest <> %s
          ) SELECT id FROM updated""", (password, account_id, previous_password, current_session)).fetchone() is not None

    def list(self, date, account_id):
        return self.execute(f"SELECT {self.FOOD_COLUMNS} FROM food_entries WHERE entry_date = %s AND account_id = %s ORDER BY created_at, id", (date, account_id)).fetchall()

    def add(self, entry, account_id):
        return self.execute(f"INSERT INTO food_entries (id, name, calories, entry_date, protein, carbs, fat, account_id) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING {self.FOOD_COLUMNS}",
                            (entry["id"], entry["name"], entry["calories"], entry["date"], entry.get("protein"), entry.get("carbs"), entry.get("fat"), account_id)).fetchone()

    def remove(self, entry_id, account_id):
        return self.execute("DELETE FROM food_entries WHERE id = %s AND account_id = %s", (entry_id, account_id)).rowcount > 0

    def list_lifts(self, date, account_id):
        return self.execute(f"SELECT {self.LIFT_COLUMNS} FROM lift_entries WHERE entry_date = %s AND account_id = %s ORDER BY created_at, id", (date, account_id)).fetchall()

    def add_lift(self, entry, account_id):
        return self.execute(f"INSERT INTO lift_entries (id, exercise, weight, unit, sets, reps, entry_date, account_id) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING {self.LIFT_COLUMNS}",
                            (entry["id"], entry["exercise"], entry["weight"], entry["unit"], entry["sets"], entry["reps"], entry["date"], account_id)).fetchone()

    def remove_lift(self, entry_id, account_id):
        return self.execute("DELETE FROM lift_entries WHERE id = %s AND account_id = %s", (entry_id, account_id)).rowcount > 0
