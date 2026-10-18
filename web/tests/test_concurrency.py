"""Race-condition tests against the production request path.

Threads start together on a barrier to maximize overlap; assertions check the final database
state, not timing. See live_app.LiveAppCase for the per-request connection setup.
"""
import threading
import unittest

from server.app import create_app

from live_app import LiveAppCase


def parallel(count, action):
    """Run action(i) in `count` threads released at the same moment; return results in order."""
    barrier, results, errors = threading.Barrier(count), [None] * count, []

    def worker(index):
        try:
            barrier.wait()
            results[index] = action(index)
        except Exception as failure:  # surfaced below so a thread error fails the test
            errors.append(failure)
    threads = [threading.Thread(target=worker, args=(index,)) for index in range(count)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(30)
    if errors:
        raise errors[0]
    return results


class ConcurrencyTests(LiveAppCase):
    def test_simultaneous_workout_starts_leave_exactly_one_current(self):
        token = self.guest_token()
        statuses = parallel(8, lambda i: self.client(token).post("/api/workouts", json={"name": f"Start {i}", "date": "2026-10-18"}).status_code)
        self.assertEqual(sorted(statuses), [201] + [409] * 7)
        self.assertEqual(self.admin.execute("SELECT count(*) AS n FROM workout_sessions WHERE is_current").fetchone()["n"], 1)

    def test_double_tapped_log_set_gets_distinct_set_numbers(self):
        token = self.guest_token()
        workout, entry = self.workout_with_exercise(token)
        path = f"/api/workouts/{workout['id']}/exercises/{entry['id']}/sets"
        statuses = parallel(20, lambda i: self.client(token).post(path, json={"reps": i + 1, "weight": 100, "unit": "lb"}).status_code)
        self.assertEqual(set(statuses), {201})
        numbers = [row["set_number"] for row in self.admin.execute("SELECT set_number FROM exercise_sets WHERE workout_exercise_id = %s ORDER BY set_number", (entry["id"],)).fetchall()]
        self.assertEqual(numbers, list(range(1, 22)))

    def test_set_limit_holds_under_contention(self):
        token = self.guest_token()
        workout, entry = self.workout_with_exercise(token, sets=98)
        path = f"/api/workouts/{workout['id']}/exercises/{entry['id']}/sets"
        statuses = parallel(6, lambda i: self.client(token).post(path, json={"reps": 1, "weight": 1, "unit": "kg"}).status_code)
        self.assertEqual(sorted(statuses), [201, 201, 400, 400, 400, 400])
        self.assertEqual(self.admin.execute("SELECT count(*) AS n FROM exercise_sets WHERE workout_exercise_id = %s", (entry["id"],)).fetchone()["n"], 100)

    def test_ending_a_workout_while_sets_are_logged_never_errors(self):
        token = self.guest_token()
        workout, entry = self.workout_with_exercise(token)
        base = f"/api/workouts/{workout['id']}"

        def action(index):
            api = self.client(token)
            if index == 0:
                return api.post(f"{base}/end").status_code
            return api.post(f"{base}/exercises/{entry['id']}/sets", json={"reps": 5, "weight": 100, "unit": "lb"}).status_code
        statuses = parallel(10, action)
        self.assertEqual(statuses[0], 200)
        self.assertTrue(set(statuses[1:]) <= {201, 404}, statuses)
        # Every set that was accepted is still there; nothing was half-written.
        accepted = statuses[1:].count(201)
        self.assertEqual(self.admin.execute("SELECT count(*) AS n FROM exercise_sets WHERE workout_exercise_id = %s", (entry["id"],)).fetchone()["n"], 1 + accepted)
        self.assertFalse(self.admin.execute("SELECT is_current FROM workout_sessions WHERE id = %s", (workout["id"],)).fetchone()["is_current"])

    def test_parallel_logins_from_one_guest_transfer_each_entry_once(self):
        account = self.app.test_client(use_cookies=False)
        registered = account.post("/api/auth/register", json={"name": "Owner", "email": "race@example.test", "password": "Race password 123"}).json
        self.client(registered["token"]).post("/api/entries", json={"name": "Account meal", "calories": 300, "date": "2026-10-18"})
        guest = self.guest_token()
        for index in range(5):
            self.client(guest).post("/api/entries", json={"name": f"Guest meal {index}", "calories": 100, "date": "2026-10-18"})
        statuses = parallel(6, lambda i: self.client(guest).post("/api/auth/login", json={"email": "race@example.test", "password": "Race password 123"}).status_code)
        self.assertEqual(set(statuses), {200})
        entries = self.client(registered["token"]).get("/api/entries?date=2026-10-18").json["entries"]
        self.assertEqual(sorted(entry["name"] for entry in entries), ["Account meal"] + [f"Guest meal {index}" for index in range(5)])
        self.assertEqual(self.admin.execute("SELECT count(*) AS n FROM users WHERE is_guest").fetchone()["n"], 0)

    def test_crossed_superset_links_end_in_one_group(self):
        token = self.guest_token()
        workout, first = self.workout_with_exercise(token)
        base = f"/api/workouts/{workout['id']}/exercises"
        second = self.client(token).post(base, json={"exerciseId": self.catalog_id("barbell-row"), "sets": [{"reps": 8, "weight": 95, "unit": "lb"}]}).json
        third = self.client(token).post(base, json={"exerciseId": self.catalog_id("lateral-raise"), "sets": [{"reps": 12, "weight": 15, "unit": "lb"}]}).json
        pairs = [(first, second), (second, first), (third, first), (first, third)]
        statuses = parallel(len(pairs), lambda i: self.client(token).put(f"{base}/{pairs[i][0]['id']}/superset", json={"with": pairs[i][1]["id"]}).status_code)
        self.assertEqual(set(statuses), {200})
        groups = {row["superset_id"] for row in self.admin.execute("SELECT superset_id FROM workout_exercises WHERE session_id = %s", (workout["id"],)).fetchall()}
        self.assertEqual(len(groups), 1)
        self.assertIsNotNone(groups.pop())

    def test_credential_limit_is_exact_under_a_burst(self):
        app = create_app(config={"TESTING": True, "CREDENTIAL_LIMIT": 20})
        statuses = parallel(30, lambda i: app.test_client().post("/api/auth/login", json={"email": "nobody@example.test", "password": "Wrong password 123"}, environ_overrides={"REMOTE_ADDR": "198.51.100.7"}).status_code)
        self.assertEqual(statuses.count(401), 20)
        self.assertEqual(statuses.count(429), 10)

    def test_simultaneous_weight_saves_keep_one_row_per_day(self):
        token = self.app.test_client(use_cookies=False).post("/api/auth/register", json={"name": "W", "email": "w@example.test", "password": "Weight password 123"}).json["token"]
        statuses = parallel(10, lambda i: self.client(token).post("/api/weights", json={"date": "2026-10-18", "weight": 70 + i, "unit": "kg"}).status_code)
        self.assertEqual(set(statuses), {200})
        self.assertEqual(len(self.client(token).get("/api/weights").json["entries"]), 1)

    def test_deleting_sets_and_exercise_at_once_leaves_no_orphans(self):
        token = self.guest_token()
        workout, entry = self.workout_with_exercise(token, sets=5)
        base = f"/api/workouts/{workout['id']}/exercises/{entry['id']}"
        set_ids = [item["id"] for item in entry["sets"]]

        def action(index):
            api = self.client(token)
            return api.delete(base).status_code if index == len(set_ids) else api.delete(f"{base}/sets/{set_ids[index]}").status_code
        statuses = parallel(len(set_ids) + 1, action)
        self.assertTrue(set(statuses) <= {200, 204, 404}, statuses)
        self.assertEqual(self.admin.execute("SELECT count(*) AS n FROM exercise_sets WHERE workout_exercise_id = %s", (entry["id"],)).fetchone()["n"], 0)
        self.assertIsNone(self.admin.execute("SELECT id FROM workout_exercises WHERE id = %s", (entry["id"],)).fetchone())


if __name__ == "__main__":
    unittest.main()
