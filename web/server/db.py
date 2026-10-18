import os
import uuid
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
    """Parameterized PostgreSQL queries for accounts and isolated diaries.

    Every diary, custom food, and weight query requires account_id. Older unowned rows remain in
    storage, but no guest or registered account can read or delete them.
    Connections are supplied per Flask request, never shared across workers.
    """
    ACCOUNT_COLUMNS = "id, name, email, is_guest"
    FOOD_COLUMNS = "id, name, calories, protein, carbs, fat, to_char(entry_date, 'YYYY-MM-DD') AS date, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS \"createdAt\""
    UTC_FORMAT = "'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'"
    CATALOG_COLUMNS = "id, slug, name, category"
    SET_COLUMNS = "id, set_number AS \"setNumber\", reps, weight, unit"
    WORKOUT_COLUMNS = "id, name, is_current AS \"isCurrent\", to_char(entry_date, 'YYYY-MM-DD') AS date, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS \"createdAt\""
    CUSTOM_FOOD_COLUMNS = "id, name, calories, protein, carbs, fat"
    WEIGHT_COLUMNS = "to_char(entry_date, 'YYYY-MM-DD') AS date, weight, unit, CASE WHEN unit = 'lb' THEN weight * 0.45359237 ELSE weight END AS \"weightKg\""

    def __init__(self, connection):
        self.connection = connection

    def execute(self, sql, params=()):
        return self.connection().execute(sql, params)

    def health(self):
        self.execute("SELECT 1")

    def allow_credentials(self, client_key, window_start, limit=20):
        """Atomically share credential limits across Gunicorn workers."""
        row = self.execute("""INSERT INTO auth_rate_limits (client_key, window_start, attempts) VALUES (%s, %s, 1)
          ON CONFLICT (client_key) DO UPDATE SET
            attempts = CASE WHEN auth_rate_limits.window_start = EXCLUDED.window_start THEN auth_rate_limits.attempts + 1 ELSE 1 END,
            window_start = EXCLUDED.window_start RETURNING attempts""", (client_key, window_start)).fetchone()
        self.execute("DELETE FROM auth_rate_limits WHERE window_start < %s", (window_start - 900,))
        return row["attempts"] <= limit

    def create_account(self, account):
        try:
            return self.execute(f"INSERT INTO users (id, name, email, password, is_guest) VALUES (%s, %s, %s, %s, %s) RETURNING {self.ACCOUNT_COLUMNS}",
                                (account["id"], account["name"], account.get("email"), account.get("password"), account.get("is_guest", False))).fetchone()
        except psycopg.errors.UniqueViolation:
            return None

    def upgrade_guest(self, account_id, account):
        """Retain diary ownership while retiring every guest session atomically."""
        try:
            return self.execute(f"""WITH updated AS (
                UPDATE users SET name = %s, email = %s, password = %s, is_guest = false
                WHERE id = %s AND is_guest = true RETURNING {self.ACCOUNT_COLUMNS}
              ), revoked AS (DELETE FROM account_sessions WHERE account_id IN (SELECT id FROM updated))
              SELECT * FROM updated""", (account["name"], account["email"], account["password"], account_id)).fetchone()
        except psycopg.errors.UniqueViolation:
            return None

    def account_by_email(self, email):
        return self.execute(f"SELECT {self.ACCOUNT_COLUMNS}, password FROM users WHERE email = %s", (email,)).fetchone()

    def account_by_id(self, account_id):
        return self.execute(f"SELECT {self.ACCOUNT_COLUMNS}, password FROM users WHERE id = %s", (account_id,)).fetchone()

    def update_account(self, account_id, name):
        return self.execute(f"UPDATE users SET name = %s WHERE id = %s RETURNING {self.ACCOUNT_COLUMNS}", (name, account_id)).fetchone()

    def create_session(self, digest, account_id, expires_at, guest_id=None):
        with self.connection().transaction():
            if guest_id and guest_id != account_id:
                self.merge_guest(guest_id, account_id)
            self.execute("INSERT INTO account_sessions (token_digest, account_id, expires_at) VALUES (%s, %s, %s)", (digest, account_id, expires_at))
            self.execute("DELETE FROM account_sessions WHERE expires_at <= now()")

    def merge_guest(self, guest_id, account_id):
        """Consume a guest diary in the session transaction without discarding logs.

        Food entries and workouts are events: two "Toast" entries on one day are two
        servings, so every guest entry/workout transfers. Only a custom food that is
        an exact duplicate (same normalized name and nutrition) is dropped, and the
        one-per-day weight key keeps the account value. Locks have a stable order to
        coordinate concurrent logins and workout starts.
        """
        owners = self.execute("SELECT id, is_guest FROM users WHERE id IN (%s, %s) ORDER BY id FOR UPDATE", (guest_id, account_id)).fetchall()
        if not any(str(row["id"]) == str(guest_id) and row["is_guest"] for row in owners):
            return
        self.execute("""DELETE FROM custom_foods g USING custom_foods a WHERE g.account_id = %s AND a.account_id = %s
            AND lower(trim(g.name)) = lower(trim(a.name)) AND g.calories = a.calories AND g.protein IS NOT DISTINCT FROM a.protein
            AND g.carbs IS NOT DISTINCT FROM a.carbs AND g.fat IS NOT DISTINCT FROM a.fat""", (guest_id, account_id))
        self.execute("DELETE FROM weight_entries g USING weight_entries a WHERE g.account_id = %s AND a.account_id = %s AND g.entry_date = a.entry_date", (guest_id, account_id))
        self.execute("UPDATE workout_sessions SET is_current = false WHERE user_id = %s AND EXISTS (SELECT 1 FROM workout_sessions WHERE user_id = %s AND is_current)", (guest_id, account_id))
        self.execute("UPDATE food_entries SET account_id = %s WHERE account_id = %s", (account_id, guest_id))
        self.execute("UPDATE custom_foods SET account_id = %s WHERE account_id = %s", (account_id, guest_id))
        self.execute("UPDATE weight_entries SET account_id = %s WHERE account_id = %s", (account_id, guest_id))
        self.execute("UPDATE workout_sessions SET user_id = %s WHERE user_id = %s", (account_id, guest_id))
        self.execute("DELETE FROM account_sessions WHERE account_id = %s", (guest_id,))
        self.execute("DELETE FROM users WHERE id = %s AND is_guest", (guest_id,))

    def session_account(self, digest):
        return self.execute("""SELECT a.id, a.name, a.email, a.is_guest FROM users a JOIN account_sessions s ON s.account_id = a.id
            WHERE s.token_digest = %s AND s.expires_at > now()""", (digest,)).fetchone()

    def remove_session(self, digest):
        self.execute("DELETE FROM account_sessions WHERE token_digest = %s", (digest,))

    def change_password(self, account_id, previous_password, password, current_session):
        """Keep this session, revoke others, and reject a concurrent stale change."""
        return self.execute("""WITH updated AS (
            UPDATE users SET password = %s WHERE id = %s AND password = %s RETURNING id
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

    def list_exercises(self):
        return self.execute(f"SELECT {self.CATALOG_COLUMNS} FROM exercises WHERE is_active ORDER BY category, name").fetchall()

    def _exercise_details(self, workout_exercise_ids):
        """Attach catalog names and ordered sets to workout exercise rows in two queries."""
        if not workout_exercise_ids:
            return {}
        rows = self.execute(f"""SELECT e.id, e.session_id, e.exercise_id AS "exerciseId", coalesce(c.name, e.legacy_name) AS exercise, e.superset_id AS "supersetId",
              to_char(e.created_at AT TIME ZONE 'UTC', {self.UTC_FORMAT}) AS "createdAt"
            FROM workout_exercises e LEFT JOIN exercises c ON c.id = e.exercise_id
            WHERE e.id = ANY(%s) ORDER BY e.created_at, e.id""", (workout_exercise_ids,)).fetchall()
        sets = self.execute(f"SELECT {self.SET_COLUMNS}, workout_exercise_id FROM exercise_sets WHERE workout_exercise_id = ANY(%s) ORDER BY set_number",
                            (workout_exercise_ids,)).fetchall()
        grouped = {str(row["id"]): {**row, "sets": []} for row in rows}
        for item in sets:
            grouped[str(item.pop("workout_exercise_id"))]["sets"].append(item)
        return grouped

    def list_workouts(self, date, account_id):
        # Fetch the day's sessions, their exercises, and sets together, without per-row queries.
        with self.connection().transaction():
            rows = self.execute(f"SELECT {self.WORKOUT_COLUMNS} FROM workout_sessions WHERE entry_date = %s AND user_id = %s ORDER BY created_at, id", (date, account_id)).fetchall()
            ids = [row["id"] for row in self.execute("SELECT e.id FROM workout_exercises e JOIN workout_sessions w ON w.id = e.session_id WHERE w.entry_date = %s AND w.user_id = %s", (date, account_id)).fetchall()]
            details = self._exercise_details(ids)
        grouped = {row["id"]: [] for row in rows}
        for exercise in sorted(details.values(), key=lambda item: (item["createdAt"], str(item["id"]))):
            grouped[exercise.pop("session_id")].append(exercise)
        return [{**row, "exercises": grouped[row["id"]]} for row in rows]

    def add_workout(self, entry, account_id, current=True):
        with self.connection().transaction():
            # Serialize starts and exercise writes across devices/Gunicorn workers.
            self.execute("SELECT id FROM users WHERE id = %s FOR UPDATE", (account_id,))
            # One workout in progress per user, across devices: a start is refused (None) until
            # the current one is ended. Historical inserts (current=False, web /api/lifts) skip this.
            if current and self.execute("SELECT 1 FROM workout_sessions WHERE user_id = %s AND is_current", (account_id,)).fetchone():
                return None
            row = self.execute(f"INSERT INTO workout_sessions (id, user_id, name, entry_date, is_current) VALUES (%s, %s, %s, %s, %s) RETURNING {self.WORKOUT_COLUMNS}",
                               (entry["id"], account_id, entry["name"], entry["date"], current)).fetchone()
        return {**row, "exercises": []}

    def current_workout(self, account_id):
        """The user's in-progress workout on any date (or None), so every day's view can show it."""
        return self.execute(f"SELECT {self.WORKOUT_COLUMNS} FROM workout_sessions WHERE user_id = %s AND is_current", (account_id,)).fetchone()

    def end_workout(self, workout_id, account_id):
        """End the user's current workout; it becomes read-only history. False if not current/owned."""
        with self.connection().transaction():
            self.execute("SELECT id FROM users WHERE id = %s FOR UPDATE", (account_id,))
            row = self.execute(f"UPDATE workout_sessions SET is_current = false WHERE id = %s AND user_id = %s AND is_current RETURNING {self.WORKOUT_COLUMNS}",
                               (workout_id, account_id)).fetchone()
        return row

    def _insert_exercise(self, session_id, exercise_id, entry_id, sets, superset_id=None):
        self.execute("INSERT INTO workout_exercises (id, session_id, exercise_id, superset_id) VALUES (%s, %s, %s, %s)", (entry_id, session_id, exercise_id, superset_id))
        with self.connection().cursor() as cursor:
            cursor.executemany("INSERT INTO exercise_sets (id, workout_exercise_id, set_number, reps, weight, unit) VALUES (%s, %s, %s, %s, %s, %s)",
                               [(str(uuid.uuid4()), entry_id, number, item["reps"], item["weight"], item["unit"]) for number, item in enumerate(sets, start=1)])
        return self._details(entry_id)

    def active_exercise(self, exercise_id):
        return self.execute("SELECT id FROM exercises WHERE id = %s AND is_active", (exercise_id,)).fetchone() is not None

    def _current_session(self, workout_id, account_id):
        """Lock the user, then confirm the session is theirs and in progress (only it is editable)."""
        self.execute("SELECT id FROM users WHERE id = %s FOR UPDATE", (account_id,))
        return self.execute("SELECT id FROM workout_sessions WHERE id = %s AND user_id = %s AND is_current", (workout_id, account_id)).fetchone() is not None

    def _join_superset(self, workout_id, partner_id):
        """Superset id shared with `partner_id` (an exercise in the same session), creating it if needed."""
        partner = self.execute("SELECT superset_id FROM workout_exercises WHERE id = %s AND session_id = %s", (partner_id, workout_id)).fetchone()
        if not partner:
            return None
        if partner["superset_id"]:
            return partner["superset_id"]
        superset_id = str(uuid.uuid4())
        self.execute("UPDATE workout_exercises SET superset_id = %s WHERE id = %s", (superset_id, partner_id))
        return superset_id

    def _tidy_supersets(self, workout_id):
        """A superset needs two exercises; clear the id from any group left with one."""
        self.execute("""UPDATE workout_exercises SET superset_id = NULL WHERE session_id = %s AND superset_id IN (
            SELECT superset_id FROM workout_exercises WHERE session_id = %s AND superset_id IS NOT NULL GROUP BY superset_id HAVING count(*) = 1)""", (workout_id, workout_id))

    def _details(self, entry_id):
        details = self._exercise_details([entry_id]).get(str(entry_id))
        if details:
            details.pop("session_id")
        return details

    def add_exercise(self, workout_id, entry, account_id):
        """Return the saved exercise; None for a missing/non-current session; False for an unknown
        catalog ID; "partner" when supersetWith is not an exercise in this session."""
        with self.connection().transaction():
            if not self._current_session(workout_id, account_id):
                return None
            if not self.active_exercise(entry["exerciseId"]):
                return False
            superset_id = None
            if entry.get("supersetWith"):
                superset_id = self._join_superset(workout_id, entry["supersetWith"])
                if not superset_id:
                    return "partner"
            return self._insert_exercise(workout_id, entry["exerciseId"], entry["id"], entry["sets"], superset_id)

    def add_set(self, workout_id, entry_id, item, account_id):
        """Append one set to an exercise in the current session. None if not found; False at 100 sets."""
        with self.connection().transaction():
            if not self._current_session(workout_id, account_id):
                return None
            if not self.execute("SELECT 1 FROM workout_exercises WHERE id = %s AND session_id = %s", (entry_id, workout_id)).fetchone():
                return None
            number = self.execute("SELECT coalesce(max(set_number), 0) + 1 AS n FROM exercise_sets WHERE workout_exercise_id = %s", (entry_id,)).fetchone()["n"]
            if number > 100:
                return False
            self.execute("INSERT INTO exercise_sets (id, workout_exercise_id, set_number, reps, weight, unit) VALUES (%s, %s, %s, %s, %s, %s)",
                         (str(uuid.uuid4()), entry_id, number, item["reps"], item["weight"], item["unit"]))
            return self._details(entry_id)

    def remove_set(self, workout_id, entry_id, set_id, account_id):
        """Delete one set. An exercise with no sets left is removed too, so every logged exercise has
        at least one set. Returns {"exercise": details or None}, or None if not found."""
        with self.connection().transaction():
            if not self._current_session(workout_id, account_id):
                return None
            deleted = self.execute("""DELETE FROM exercise_sets s USING workout_exercises e WHERE s.workout_exercise_id = e.id
                AND e.id = %s AND e.session_id = %s AND s.id = %s RETURNING s.set_number""", (entry_id, workout_id, set_id)).fetchone()
            if not deleted:
                return None
            # Keep numbers 1..n so a deleted set frees its slot under the 100-set limit.
            self.execute("UPDATE exercise_sets SET set_number = set_number - 1 WHERE workout_exercise_id = %s AND set_number > %s",
                         (entry_id, deleted["set_number"]))
            if not self.execute("SELECT 1 FROM exercise_sets WHERE workout_exercise_id = %s", (entry_id,)).fetchone():
                self.execute("DELETE FROM workout_exercises WHERE id = %s", (entry_id,))
                self._tidy_supersets(workout_id)
                return {"exercise": None}
            return {"exercise": self._details(entry_id)}

    def set_superset(self, workout_id, entry_id, partner_id, account_id):
        """Join entry_id to partner_id's superset (partner_id None leaves it). Returns the session's
        exercises' superset ids as {id: supersetId}, or None if either exercise is not in the session."""
        with self.connection().transaction():
            if not self._current_session(workout_id, account_id):
                return None
            if not self.execute("SELECT 1 FROM workout_exercises WHERE id = %s AND session_id = %s", (entry_id, workout_id)).fetchone():
                return None
            if partner_id:
                if str(partner_id) == str(entry_id):
                    return None
                partner = self.execute("SELECT superset_id FROM workout_exercises WHERE id = %s AND session_id = %s", (partner_id, workout_id)).fetchone()
                if not partner:
                    return None
                own = self.execute("SELECT superset_id FROM workout_exercises WHERE id = %s", (entry_id,)).fetchone()["superset_id"]
                # Linking merges groups instead of moving one exercise out of its group, so the result
                # is the same whichever of two concurrent links commits first (found by a race test).
                target = partner["superset_id"] or own or str(uuid.uuid4())
                self.execute("UPDATE workout_exercises SET superset_id = %s WHERE id IN (%s, %s)", (target, entry_id, partner_id))
                if own and str(own) != str(target):
                    self.execute("UPDATE workout_exercises SET superset_id = %s WHERE session_id = %s AND superset_id = %s", (target, workout_id, own))
            else:
                self.execute("UPDATE workout_exercises SET superset_id = NULL WHERE id = %s", (entry_id,))
            self._tidy_supersets(workout_id)
            rows = self.execute("SELECT id, superset_id FROM workout_exercises WHERE session_id = %s", (workout_id,)).fetchall()
            return {str(row["id"]): row["superset_id"] and str(row["superset_id"]) for row in rows}

    def remove_exercise(self, workout_id, entry_id, account_id):
        with self.connection().transaction():
            self.execute("SELECT id FROM users WHERE id = %s FOR UPDATE", (account_id,))
            removed = self.execute("DELETE FROM workout_exercises e USING workout_sessions w WHERE e.session_id = w.id AND w.id = %s AND w.user_id = %s AND w.is_current AND e.id = %s", (workout_id, account_id, entry_id)).rowcount > 0
            if removed:
                self._tidy_supersets(workout_id)
            return removed

    def exercise_history(self, account_id, exercise_id, limit=20):
        """The user's most recent sessions containing one catalog exercise, oldest first, with sets.

        Lifts (while logging) and Profile (progress) both read this, so they always agree.
        Repeated entries of one exercise in a session are merged into that session's sets.
        """
        sessions = self.execute("""SELECT w.id, w.name, to_char(w.entry_date, 'YYYY-MM-DD') AS date, w.is_current AS "isCurrent"
            FROM workout_sessions w WHERE w.user_id = %s AND EXISTS (SELECT 1 FROM workout_exercises e WHERE e.session_id = w.id AND e.exercise_id = %s)
            ORDER BY w.entry_date DESC, w.created_at DESC, w.id DESC LIMIT %s""", (account_id, exercise_id, limit)).fetchall()
        if not sessions:
            return []
        sets = self.execute("""SELECT e.session_id, s.reps, s.weight, s.unit FROM exercise_sets s JOIN workout_exercises e ON e.id = s.workout_exercise_id
            WHERE e.exercise_id = %s AND e.session_id = ANY(%s) ORDER BY e.created_at, s.set_number""", (exercise_id, [row["id"] for row in sessions])).fetchall()
        grouped = {str(row["id"]): {**row, "sets": []} for row in reversed(sessions)}
        for item in sets:
            grouped[str(item.pop("session_id"))]["sets"].append(item)
        return list(grouped.values())

    def progress_summary(self, account_id):
        """One row per catalog exercise the user has logged: session count, dates, and the best and
        first/latest per-session estimated 1RM (kg, Epley) plus max reps for bodyweight work."""
        return self.execute("""WITH per AS (
              SELECT e.exercise_id, w.id, w.entry_date, w.created_at,
                max(CASE WHEN s.reps <= 1 THEN k.kg ELSE k.kg * (1 + s.reps / 30.0) END) AS e1rm, max(s.reps) AS reps,
                -- The session's top set: heaviest weight, then most reps at it (what Progress lists).
                max(k.kg) AS top_kg, (array_agg(s.reps ORDER BY k.kg DESC, s.reps DESC))[1] AS top_reps,
                (array_agg(s.unit ORDER BY k.kg DESC, s.reps DESC))[1] AS unit
              FROM workout_exercises e JOIN workout_sessions w ON w.id = e.session_id
              JOIN exercise_sets s ON s.workout_exercise_id = e.id
              CROSS JOIN LATERAL (SELECT CASE WHEN s.unit = 'lb' THEN s.weight * 0.45359237 ELSE s.weight END AS kg) k
              WHERE w.user_id = %s AND e.exercise_id IS NOT NULL
              GROUP BY e.exercise_id, w.id, w.entry_date, w.created_at)
            SELECT c.id, c.name, c.category, count(*)::int AS sessions, to_char(max(per.entry_date), 'YYYY-MM-DD') AS "lastDate",
              round(max(per.e1rm)::numeric, 2)::float AS "bestE1rmKg",
              round(((array_agg(per.e1rm ORDER BY per.entry_date, per.created_at))[1])::numeric, 2)::float AS "firstE1rmKg",
              round(((array_agg(per.e1rm ORDER BY per.entry_date DESC, per.created_at DESC))[1])::numeric, 2)::float AS "latestE1rmKg",
              max(per.reps) AS "maxReps", (array_agg(per.unit ORDER BY per.entry_date DESC, per.created_at DESC))[1] AS unit,
              round(max(per.top_kg)::numeric, 2)::float AS "bestWeightKg",
              round(((array_agg(per.top_kg ORDER BY per.entry_date, per.created_at))[1])::numeric, 2)::float AS "firstWeightKg",
              round(((array_agg(per.top_kg ORDER BY per.entry_date DESC, per.created_at DESC))[1])::numeric, 2)::float AS "latestWeightKg",
              (array_agg(per.top_reps ORDER BY per.entry_date DESC, per.created_at DESC))[1] AS "latestReps"
            FROM per JOIN exercises c ON c.id = per.exercise_id
            GROUP BY c.id, c.name, c.category ORDER BY max(per.entry_date) DESC, c.name""", (account_id,)).fetchall()

    # Compatibility for the paused web interface: aggregate rows over the set-based model.
    def list_lifts(self, date, account_id):
        return self.execute(f"""SELECT e.id, coalesce(c.name, e.legacy_name) AS exercise, first.weight, first.unit, count(s.id)::int AS sets, first.reps,
              to_char(w.entry_date, 'YYYY-MM-DD') AS date, to_char(e.created_at AT TIME ZONE 'UTC', {self.UTC_FORMAT}) AS "createdAt"
            FROM workout_exercises e JOIN workout_sessions w ON w.id = e.session_id
            LEFT JOIN exercises c ON c.id = e.exercise_id
            JOIN exercise_sets s ON s.workout_exercise_id = e.id
            JOIN LATERAL (SELECT weight, unit, reps FROM exercise_sets f WHERE f.workout_exercise_id = e.id ORDER BY set_number LIMIT 1) first ON true
            WHERE w.entry_date = %s AND w.user_id = %s
            GROUP BY e.id, c.name, e.legacy_name, first.weight, first.unit, first.reps, w.entry_date, e.created_at
            ORDER BY e.created_at, e.id""", (date, account_id)).fetchall()

    def catalog_match(self, name):
        row = self.execute("""SELECT id FROM exercises WHERE is_active AND (lower(name) = lower(trim(%s)) OR lower(trim(%s)) = ANY (aliases))
            ORDER BY (lower(name) = lower(trim(%s))) DESC LIMIT 1""", (name, name, name)).fetchone()
        return row["id"] if row else None

    def add_lift(self, entry, account_id):
        """Expand an aggregate web lift into sets; None when the name is not in the catalog."""
        exercise_id = self.catalog_match(entry["exercise"])
        if not exercise_id:
            return None
        with self.connection().transaction():
            self.execute("SELECT id FROM users WHERE id = %s FOR UPDATE", (account_id,))
            workout = self.execute("SELECT id FROM workout_sessions WHERE user_id = %s AND entry_date = %s ORDER BY is_current DESC, created_at DESC, id DESC LIMIT 1", (account_id, entry["date"])).fetchone()
            if not workout:
                workout = self.add_workout({"id": str(uuid.uuid4()), "name": "Workout", "date": entry["date"]}, account_id, current=False)
            sets = [{"reps": entry["reps"], "weight": entry["weight"], "unit": entry["unit"]}] * entry["sets"]
            saved = self._insert_exercise(workout["id"], exercise_id, entry["id"], sets)
        return {"id": saved["id"], "exercise": saved["exercise"], "weight": entry["weight"], "unit": entry["unit"], "sets": entry["sets"],
                "reps": entry["reps"], "date": entry["date"], "createdAt": saved["createdAt"]}

    def remove_lift(self, entry_id, account_id):
        return self.execute("DELETE FROM workout_exercises e USING workout_sessions w WHERE e.session_id = w.id AND e.id = %s AND w.user_id = %s", (entry_id, account_id)).rowcount > 0

    def list_custom_foods(self, account_id):
        return self.execute(f"SELECT {self.CUSTOM_FOOD_COLUMNS} FROM custom_foods WHERE account_id = %s ORDER BY created_at, id", (account_id,)).fetchall()

    def add_custom_food(self, food, account_id):
        return self.execute(f"INSERT INTO custom_foods (id, account_id, name, calories, protein, carbs, fat) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING {self.CUSTOM_FOOD_COLUMNS}",
                            (food["id"], account_id, food["name"], food["calories"], food.get("protein"), food.get("carbs"), food.get("fat"))).fetchone()

    def remove_custom_food(self, food_id, account_id):
        return self.execute("DELETE FROM custom_foods WHERE id = %s AND account_id = %s", (food_id, account_id)).rowcount > 0

    def list_weights(self, account_id):
        # Select the latest 30 logged dates, then restore chronological chart order.
        return self.execute(f"SELECT {self.WEIGHT_COLUMNS} FROM (SELECT entry_date, weight, unit FROM weight_entries WHERE account_id = %s ORDER BY entry_date DESC LIMIT 30) recent ORDER BY entry_date", (account_id,)).fetchall()

    def save_weight(self, entry, account_id):
        # Upserting the account/date key makes correcting a daily log idempotent.
        return self.execute(f"INSERT INTO weight_entries (account_id, entry_date, weight, unit) VALUES (%s, %s, %s, %s) ON CONFLICT (account_id, entry_date) DO UPDATE SET weight = EXCLUDED.weight, unit = EXCLUDED.unit RETURNING {self.WEIGHT_COLUMNS}",
                            (account_id, entry["date"], entry["weight"], entry["unit"])).fetchone()

    def remove_weight(self, date, account_id):
        return self.execute("DELETE FROM weight_entries WHERE account_id = %s AND entry_date = %s", (account_id, date)).rowcount > 0
