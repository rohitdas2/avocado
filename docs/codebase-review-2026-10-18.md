# Codebase review — October 18, 2026

The five-table workout redesign is implemented in the current code and applied to the configured PostgreSQL database. This review made no application-code changes and did not migrate or modify the configured database. Database metadata was inspected in a read-only transaction; test writes used isolated schemas.

## Current architecture

- Expo SDK 58 / React Native mobile client, React/Vite website, one Flask REST application behind Gunicorn, and PostgreSQL. Cookie and bearer authentication reach the same endpoints.
- `users → workout_sessions → workout_exercises → exercise_sets`; `workout_exercises.exercise_id` references the separate application-owned `exercises` catalog. The configured database contains all five tables and 34 catalog definitions. Food, custom foods, authentication sessions, rate limits, and bodyweight tables also remain.
- The catalog API is read-only. New exercise logs require an active catalog ID. Migrated unmatched names remain readable under `legacy_name` with a nullable catalog ID; users cannot create new catalog definitions through the API.
- The repeatable migration renames accounts/workouts, preserves IDs and timestamps, expands aggregate sets into individual rows, and matches old names/aliases against the catalog. An integration fixture checks the former schema and runs migration twice.
- One current workout per user; a second start returns 409 until the first is explicitly ended. Current workouts support individual set logging/deletion and supersets. Ended workouts are read-only through the mobile workout API. Legacy web `/api/lifts` adapters still use more permissive historical writes/deletes, as already noted in the Google Doc.
- Progress uses shared server calculations and reads, with `ExerciseProgress` and `ProgressSheet` on mobile. Profile replaces Settings. Food combines USDA search and quick add. Pure chart/workout helpers and the request client have Node tests.
- Guest login now preserves every meal/workout event, even when names match. Only exact custom-food duplicates are removed; daily weight and current-workout conflicts retain the account's values. Decision 30 supersedes decision 29's name/date deduplication.

## Checks run

- `web`: all **45 backend tests passed**, with real PostgreSQL integration and concurrency tests enabled through TEST_DATABASE_URL.
- `mobile`: all **17 tests passed**, plus TypeScript and ESLint.
- The configured database has `users`, `exercises`, `workout_sessions`, `workout_exercises`, and `exercise_sets`. Old `accounts`/`workouts` tables are absent. No personal row contents were needed for this check.
- No new simulator or physical-device interaction was performed for this review. Build exports are not signed device installations.

## Findings

1. **[P2] Deleting an earlier set does not free a slot at the 100-set boundary.** `web/server/db.py:249` appends at `max(set_number) + 1`, while `remove_set` leaves gaps. Reproduced in an isolated schema: create 100 sets, delete set 1 (HTTP 200), then append; the API returns HTTP 400, “An exercise can have at most 100 sets,” although only 99 remain. Mobile labels the next set using the remaining array length (`mobile/src/app/lifts.tsx:108`), so the UI suggests another set is available. Choose stable sparse numbering with a separate count limit, or safely renumber after deletion, and cover delete-then-append in the database tests. No fix applied during this review. **Fixed afterwards (decision 41):** deletes renumber later sets, the unique constraint is deferrable, and `test_deleting_a_set_frees_a_slot_under_the_100_set_limit` covers it.
2. **Documentation and verification evidence have drifted.** The Google Doc says 55 backend tests and references `web/tests/test_edge_cases.py`; this checkout has 45 discovered tests and that file is absent. The local continuation checkpoint still says the five-table migration is pending; mobile/README.md and the local architecture/verification files describe older workout behavior. Decisions 30–40 in the Google Doc are the more current design narrative, but their test-count claims need reconciliation with this checkout.

## Important files for continued work

Backend: `web/server/schema.sql`, `db.py`, `app.py`, `validation.py`, `progress.py`, `nutrition.py`, `auth.py`.

Mobile: `mobile/src/app/lifts.tsx`, `profile.tsx`, `_layout.tsx`, `mobile/App.tsx`, `ScreenHeader.tsx`, `SignIn.tsx`, `session.tsx`, `ProgressSheet.tsx`, `ExerciseProgress.tsx`, `WeightTracker.tsx`, `workoutLogic.ts`, `apiClient.ts`.

Tests: `web/tests/test_postgres.py`, `test_concurrency.py`, `live_app.py`, `test_progress.py`, `test_nutrition_ranking.py`, `test_api.py`, `fixtures/schema_before_exercise_sets.sql`, and `mobile/tests/*.test.mjs`.
