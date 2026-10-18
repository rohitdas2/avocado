# Verification — October 18, 2026

Current implementation: React web + Expo mobile, Flask/Gunicorn API, PostgreSQL.

Mobile workout update: users own named workouts, and workouts own exercise snapshots. Multiple workouts per day are supported, with one current workout per account. Web interface changes are deferred; its existing lift endpoints remain compatible with the shared schema.

Verified on iPhone 17 Pro / iOS 26.5 in Expo Go: create “Morning push,” save Bench press (3 × 8, 135 lb) and Shoulder press (3 × 8, 45 lb), then create “Evening pull” on the same date. Each appears once in the minute-level timeline. Creation and tapping the current workout leave the exercise form inline without a popup; tapping Morning push opens its read-only summary with both exercises. Close returns to the timeline, switching dates filters workouts, and returning to today preserves them. Preview: [workout summary](mobile-workout-summary.jpg).

Workout checks: mobile TypeScript, ESLint, and iOS/Android JavaScript exports passed. Both real PostgreSQL integration tests passed, covering repeatable migrations, owned/unowned legacy exercise preservation, multiple daily workouts, exercise foreign keys/cascade behavior, current-workout uniqueness, stale-current writes, account isolation, and guest signup retaining workouts. No changes were made to the user's configured database; the preview uses the temporary fixture database.

Timeline update: existing food/lift timestamps are returned as UTC ISO strings and rendered as local HH:mm in chronological timelines. Web build, API suite, PostgreSQL timestamp/offset/round-trip checks, mobile type-check and lint passed. Browser verified minute-only labels and ordering. The focused code change is 46 changed lines including regression checks; no schema migration.

Passed for this revision:

- Web TypeScript check and production Vite build.
- 23 Python unit/API tests. The default test command additionally skips the two PostgreSQL tests unless TEST_DATABASE_URL is supplied.
- Real PostgreSQL 18.4 integration in an isolated schema: repeatable migrations from legacy tables; unowned row preservation; parameterized SQL; constraints; persistent sessions across connections; account/guest isolation and upgrades; password revocation; shared rate limiting; custom-food ownership/deletion snapshots; daily weight upserts, conversion and privacy.
- Gunicorn with two sync workers and health check against a temporary fixture-only database.
- Browser: persistent guest food after reload, signup preserving guest food, persistent registered login, quick-add protein/carbs/fat totals, reusable custom-food save/log, lift logging, daily weight logging and line graph, system dark appearance and explicit Light override.
- Browser at 390px width: no horizontal document overflow.
- Two tabs: logout hides Settings, clears the old account's displayed diary/draft, and exposes Log in/Sign up in both; login restores the account diary in both.
- Independent bearer client: same diary/custom foods as the browser and correctly converted weights saved to the shared API, visible in the browser's graph.
- Mobile TypeScript, ESLint, and iOS/Android JavaScript exports, including custom foods, weight tracking, and the line graph.

Limits:

- No physical phone or Android emulator interaction was run. The mobile workout flow was exercised in the iOS simulator as described above; an export is not a signed installable app.
- No signed IPA/APK, EAS build, TestFlight/store submission, public hosting, or production TLS/proxy deployment was performed.
- The preview uses an isolated temporary PostgreSQL database with invented test entries. The user's configured database was not migrated or changed by these verification runs.
- The requested salted SHA-512 format is implemented; it is a fast hash, with the password-KDF tradeoff documented in the architecture review. Email verification/reset, MFA, account deletion/export, and offline writes are not implemented.
- Existing unowned legacy rows remain stored but hidden until ownership is explicitly assigned.
- No new live USDA request was required for this interface work; the Python port's normalization and failure handling are covered by tests. The October 16 live USDA/simulator checks below are historical evidence only.

Phone setup and shared-backend instructions: [phone guide](phone-setup.md).

---

## Historical verification

# Verification — October 16, 2026

Passed:
- React TypeScript check and production build.
- 8 backend tests: food CRUD, daily totals, date validation/isolation, errors, nutrient parsing, macro validation, lift validation, USDA search response/error handling.
- Real PostgreSQL integration test using a temporary PostgreSQL 18 runtime: repeatable migrations, food/macros committed across separate connections, constraints, lift storage/date isolation/deletion, and missing-entry handling.
- Live USDA search using its public demo key.
- Browser: add food, reload persistence, change date, return to today, save a lift, search USDA, log a 50 g avocado portion. Result: 84 kcal, 1.0 g protein, 4.3 g carbs, 7.7 g fat.
- React Native TypeScript and ESLint checks.
- Expo iOS and Android production JavaScript bundle exports.
- iPhone 17 Pro simulator / Expo Go: app opens; both Food and Lifts tabs read entries from the same PostgreSQL API as the website.

Limits:
- Android bundle compiled; Android device/emulator interaction was not tested.
- No signed native binaries or app-store releases were created.
- Docker Compose is provided but was not executed because Docker is not installed here. Database tests used a real temporary PostgreSQL process instead.
- Mobile dependency audit reports upstream advisories in Expo/Metro tooling, including braces, node-forge, and uuid dependency chains. The registry did not offer patched releases for braces/node-forge at the time checked. Do not use npm audit fix --force: its proposed downgrades break Expo compatibility. Recheck upstream patches before distribution. The web package install reported zero advisories.
- The Expo lint wrapper incorrectly rejected the installed ESLint 9 version; the `lint` script runs ESLint directly with Expo's generated config and passes.
- No Swift app data migration is included. The new clients use PostgreSQL, not SwiftData.
- The original chat ZIP was not available locally. The existing project was Swift; these are newly built React clients, retaining its forest-green palette.
