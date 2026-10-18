# Continuation checkpoint — October 18, 2026

Stopped at 4% remaining account usage at the user's request. Do not start more implementation until the user continues. Preserve the large existing dirty working tree; do not commit or revert unrelated changes.

## Auth work completed

- Mobile ScreenHeader opens native login/signup sheets using SignIn; it previously navigated to a hidden auth tab. Login sheet appearance was verified in the original iPhone simulator before the user signed in there.
- Forms already call the shared REST endpoints: POST /api/auth/register and POST /api/auth/login. Browser cookies and mobile SecureStore bearer tokens are two transports to the same Flask/Gunicorn API, not separate APIs.
- Login now transfers guest foods, custom foods, weights, workouts and exercises to the authenticated account. Existing account records win overlaps: date + normalized name for foods/workouts, normalized name for custom foods, date for weights. Existing current workout wins. An overlapping account workout retains all its own exercises.
- Transfer, consumed guest-session revocation, guest-owner deletion and new account-session creation are transactional. Stable account lock ordering coordinates concurrent starts/logins; forced insert failure tests rollback.
- Signup retains the guest account ID and rotates session credentials. Mobile clears the guest key after either signup/login; logout creates a fresh guest diary.
- Login SQL is already parameterized. Reviewed only that path and tested SQL-like email/password strings: no authentication and intact tables/accounts.

Files: mobile/ScreenHeader.tsx, SignIn.tsx, session.tsx; web/server/app.py and db.py; web/tests/helpers.py, test_api.py and test_postgres.py. README.md, mobile/README.md, web/README.md and architecture decisions updated.

## Verified

- All 26 API tests including real PostgreSQL integration passed using TEST_DATABASE_URL=postgresql://avocado_fixture:avocado_fixture_only@127.0.0.1:55432/avocado_test and npm test from web.
- Mobile npm run typecheck, npm run lint and npm run build passed (iOS/Android JavaScript exports, not signed binaries).
- Login sheet opens visually. Remaining: complete disposable signup, wrong-password error, successful login, persistence/logout and guest-transfer UI checks on the separate simulator.

## New user request: NEXT implementation

Modify PostgreSQL workout model to five domain tables: users, exercises (app-owned catalog), workout_sessions, workout_exercises (session/catalog join), exercise_sets (individual sets/reps/weight/performance). Users cannot define catalog exercises; they log performance against application definitions. Other food/session/auth tables are still required. This migration is NOT written or applied. Decide whether to rename existing accounts to users consistently, then preserve IDs/FKs/history, expand old aggregate set counts into individual set rows, adapt the shared API and mobile exercise selection, keep old web routes compatible, and test repeatable migration plus authorization. Document reasons/alternatives in the existing Google Doc.

## Runtime / safe resume

- Original iPhone 17 Pro ACF46F91-52D9-420A-AD4F-DBB8F341104E now has the USER'S active account. Do not log it out, change credentials, delete its data, or seed its diary for tests.
- User authorized a SEPARATE simulator: iPhone 17 Pro Max 10478B94-72C3-47E4-A2EE-9608C0557008, booted; official Expo Go copied there. Last observed Safari contains exp://127.0.0.1:8081 and an Open in Expo Go prompt. CUA authSimulator currently selected its window. Always refresh AX/screenshot before action; user is actively using the original Simulator window, and app-wide focus may move.
- Metro runs on 8081, exec session 28601, API URL http://127.0.0.1:3001. Gunicorn master 29207 on 3001, two workers, reloaded after auth change. Verify PID before HUP.
- Temporary preview PostgreSQL port 55432, database avocado; tests use avocado_test isolated schemas. Preview now includes user-entered data; do not assume all its records are disposable. No new schema migration required for auth.
- Google Doc: https://docs.google.com/document/d/1vXYKu_-QJOdeCbW8eY45KkMuD4wiRGWAgp8zMakvKuM . Decision 29 records auth changes and pending five-table request. Use guarded revisions for further edits.
