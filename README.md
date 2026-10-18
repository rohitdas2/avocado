# Avocado

Food and lift tracking on the web and on iOS/Android, backed by one Flask API and PostgreSQL database. The API runs under Gunicorn. The clients share entries when signed into the same account.

- `web/client/`: React + TypeScript, built with Vite.
- `web/server/`: Flask, psycopg, and Gunicorn.
- `mobile/`: React Native + Expo Router.
- [Web developer guide](web/README.md): code map, request flows, sessions, and themes.
- [Architecture decisions](docs/architecture-decisions.md): rationale, alternatives, tradeoffs, and review questions.

## Run the website and API

Install Node.js 24, Python 3.12 or newer, and PostgreSQL (or Docker Desktop for the supplied database container). From this project's `web` directory:

```sh
cd web
cp .env.example .env
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
docker compose up -d --wait db
npm run db:migrate
npm run dev
```

Open http://127.0.0.1:5173. Gunicorn serves the API on http://127.0.0.1:3001; Vite proxies `/api` to it. `npm run dev` starts both processes. Use `npm run web:dev` or `npm run api:dev` to run them separately. Gunicorn requires a Unix environment; use Linux/WSL on Windows.

If PostgreSQL is already running, set `DATABASE_URL` in `web/.env` and skip Docker. Migrations are repeatable. The schema keeps existing food/lift rows; rows created before account support remain unowned and hidden until explicitly assigned to their owner. They are never automatically given to the first signup. Back up an existing database before migrating it.

Docker stores the database in `avocado_data`. `docker compose stop` stops it without deleting entries. `docker compose down -v` deletes that volume.

## Accounts, guests, and appearance

The app opens a private guest diary automatically. Guests see Log in and Sign up at the top right; Profile is visible only after authentication. The web app and the mobile app offer the same features: Food (USDA search, quick add, custom foods), Lifts (named workouts, catalog exercises, one set at a time, supersets, next-set targets), and Profile (Progress per exercise, daily weight with a line graph, name and password changes, System/Light/Dark appearance, logout).

Creating an account upgrades the current guest diary and keeps its entries. Signing into an existing account transfers the current guest diary into that account, with existing account records taking priority on overlap. Both actions revoke the old guest credential and issue a new account session. Signing out opens a fresh guest diary. Both clients use the same Flask REST API and PostgreSQL database; use the same registered account for shared data.

Web sessions use HttpOnly, SameSite=Strict cookies with a 30-day expiry. Production cookies require HTTPS. Mobile stores its bearer session tokens in Expo SecureStore. The database stores a SHA-256 digest of each random session token, not the token itself. Signing out revokes the current account session. Changing a password retains the current session and revokes the account's other sessions.

Passwords follow the requested reference exactly: one `password` column containing `sha512$salt$hexdigest`, with a unique UUID4 hex salt and SHA-512 of UTF-8 `salt + password`; verification uses a constant-time digest comparison. SHA-512 is fast, so it gives less resistance to offline password guessing than Argon2id, scrypt, or PBKDF2. Passwords must have 12–128 characters. Login/registration/guest/password endpoints have a PostgreSQL-backed rate limit shared across Gunicorn workers. Email verification, password recovery, and MFA are not implemented.

Appearance follows the operating system by default. Explicit overrides are local to each browser/device, so a phone and laptop can use different appearances. Guests follow the system; an authenticated user's saved device override returns on the next login.

## Custom foods, quick add, and weight

Quick add accepts calories and optional protein, carbs, and fat in grams. Blank macros remain unknown. Custom foods save reusable nutrition per serving in the shared database; adding one copies its current nutrition into that day's diary. Deleting a custom food leaves existing diary entries intact. Guest custom foods remain with the diary when the guest creates an account.

Authenticated users can log one weight per calendar day in Profile. Saving the same day updates that measurement. Entries retain the entered lb/kg value and also use a canonical kilogram value, so the chart compares consistent units. The line graph covers up to the last 30 calendar days, starts at the first log (at least a week shown), joins logged days, and scales to the logged range; selecting a point edits that day. Weight records are account-owned and unavailable in guest mode.

## Get the app on a phone

Follow the [step-by-step phone setup guide](docs/phone-setup.md) for local testing, installable builds, and cross-device sync checks.

For local testing, keep the phone and computer on the same trusted Wi-Fi network. In `web/.env`, set `HOST=0.0.0.0`, then restart the API. From `mobile`:

```sh
cd mobile
npm ci
cp .env.example .env
```

Set `EXPO_PUBLIC_API_URL` in `mobile/.env` to `http://YOUR_COMPUTER_LAN_IP:3001`, then run:

```sh
npm start
```

Open the QR code in a compatible Expo Go client. The computer and API must remain running. Restart Expo after changing the URL. A physical phone's `localhost` points to the phone, so use the computer's LAN address. iOS Simulator defaults to `127.0.0.1:3001`; Android emulator defaults to `10.0.2.2:3001`.

To install Avocado independently of Expo Go, configure your own Expo project and iOS bundle ID/Android package, then use an [EAS development or distribution build](https://docs.expo.dev/build/introduction/). iPhone distribution requires Apple signing/provisioning; TestFlight distribution requires the relevant Apple developer setup. No signed IPA/APK, paid build, or store submission has been created here. `npm run build` in mobile only verifies JavaScript bundles.

## Keep the phone and website synced

Deploy the built website and Flask API together at one HTTPS origin, backed by a persistent PostgreSQL database. Set the server's `DATABASE_URL`, then set mobile's `EXPO_PUBLIC_API_URL` to that same HTTPS origin and rebuild/restart the app. The website uses relative `/api` URLs, so it automatically reaches its own backend.

Sign into the same account on each client. Adds/deletes save to the shared database immediately. Both Food and Lifts refresh when returning to the active app/tab and every 15 seconds while active, without clearing draft inputs. This is polling rather than instant push sync. Offline writes and conflict resolution are not implemented. Authentication sessions are per device; signing into the same account does not require sharing cookies between phone and browser.

`EXPO_PUBLIC_API_URL` is public client configuration. Never put database credentials or USDA keys in it.

## Ingredient macros

The API searches USDA FoodData Central's SR Legacy ingredients. Calories/protein/carbs/fat are scaled from per-100g values to the chosen portion. Unknown nutrients remain unknown; totals are marked partial when needed. Quick add records calories only. Choose the matching raw/cooked ingredient.

Set `USDA_API_KEY` in `web/.env`. `DEMO_KEY` is for initial exploration (30 requests/hour, 50/day per IP). Get a free key at https://fdc.nal.usda.gov/api-key-signup/. Manual food/lift entry still works if USDA is unavailable. The key stays on the server.

Source: [USDA FoodData Central](https://fdc.nal.usda.gov/).

## Verify

```sh
cd web
npm run build
npm test
TEST_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/avocado npm run test:integration
cd ../mobile
npm run typecheck
npm run lint
npm run build
```

PostgreSQL tests use their own random schema and require schema-creation permission. They do not delete your diary. See [verification notes](docs/verification.md) for current results and remaining limitations.

## Run a production build

```sh
cd web
npm ci
.venv/bin/python -m pip install -r requirements.txt
npm run build
npm run db:migrate
AVOCADO_ENV=production HOST=0.0.0.0 npm start
```

Create `.venv` first if it does not exist. Put Gunicorn behind an HTTPS reverse proxy or a host with TLS termination. Set `DATABASE_URL`, `USDA_API_KEY`, `HOST`, and the host's `PORT`. `WEB_CONCURRENCY` defaults to two workers. The startup configuration is `web/gunicorn.conf.py`; the health endpoint is `/api/health`. Use the database provider's required TLS configuration; do not disable certificate verification.

This implementation has account and guest isolation, but it has not been deployed publicly or audited for a public launch. The architecture review describes the remaining security and operational decisions.
